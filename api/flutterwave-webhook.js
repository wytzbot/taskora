// api/flutterwave-webhook.js

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function initializeFirebase() {
  if (getApps().length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin configuration is missing.");
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const secretHash =
      process.env.FLW_SECRET_HASH ||
      process.env.FLUTTERWAVE_WEBHOOK_SECRET;

    const secretKey =
      process.env.FLW_SECRET_KEY ||
      process.env.FLUTTERWAVE_SECRET_KEY;

    if (!secretHash || !secretKey) {
      console.error("Flutterwave environment variables are missing.");

      return res.status(500).json({
        success: false,
        message: "Webhook is not configured"
      });
    }

    // ---------------------------------------------------------
    // 1. VERIFY FLUTTERWAVE WEBHOOK SIGNATURE
    // ---------------------------------------------------------

    const signature =
      req.headers["verif-hash"] ||
      req.headers["verif_hash"] ||
      req.headers["x-verif-hash"];

    if (!signature || signature !== secretHash) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature"
      });
    }

    const event = req.body || {};

    // ---------------------------------------------------------
    // 2. IGNORE EVENTS WE DON'T NEED
    // ---------------------------------------------------------

    if (
      event?.event &&
      event.event !== "charge.completed"
    ) {
      return res.status(200).json({
        success: true,
        message: "Event ignored"
      });
    }

    const webhookData = event?.data || event;

    const transactionId =
      webhookData?.id ||
      webhookData?.transaction_id;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Missing transaction ID"
      });
    }

    // ---------------------------------------------------------
    // 3. VERIFY TRANSACTION DIRECTLY WITH FLUTTERWAVE
    // ---------------------------------------------------------

    const verifyResponse = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(
        transactionId
      )}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!verifyResponse.ok) {
      console.error(
        "Flutterwave verification failed:",
        verifyResponse.status
      );

      return res.status(400).json({
        success: false,
        message: "Unable to verify transaction"
      });
    }

    const verification = await verifyResponse.json();

    if (
      verification?.status !== "success" ||
      verification?.data?.status !== "successful"
    ) {
      return res.status(400).json({
        success: false,
        message: "Transaction was not successful"
      });
    }

    const transaction = verification.data;

    // ---------------------------------------------------------
    // 4. VERIFY AMOUNT + CURRENCY
    // ---------------------------------------------------------

    const amount = Number(transaction.amount);

    const currency = String(
      transaction.currency || ""
    ).toUpperCase();

    const validPayment =
      (currency === "NGN" && amount >= 2000) ||
      (currency === "USD" && amount >= 2);

    if (!validPayment) {
      console.warn("Invalid Taskora payment:", {
        amount,
        currency,
        transactionId
      });

      return res.status(400).json({
        success: false,
        message: "Invalid Taskora payment amount"
      });
    }

    // ---------------------------------------------------------
    // 5. IDENTIFY TASKORA USER
    // ---------------------------------------------------------

    const metadata = transaction.meta || {};

    const userId =
      metadata.taskora_user_id ||
      metadata.user_id;

    if (!userId) {
      console.error(
        "No Taskora Firebase user ID found in payment metadata."
      );

      return res.status(400).json({
        success: false,
        message: "Missing Taskora user identifier"
      });
    }

    // ---------------------------------------------------------
    // 6. INITIALIZE FIREBASE
    // ---------------------------------------------------------

    initializeFirebase();

    const db = getFirestore();

    const transactionKey = String(transactionId);

    // ---------------------------------------------------------
    // 7. IDEMPOTENCY CHECK
    //
    // Flutterwave can retry webhooks.
    // Never grant Premium twice.
    // ---------------------------------------------------------

    const paymentRef = db
      .collection("processedPayments")
      .doc(transactionKey);

    const existingPayment = await paymentRef.get();

    if (existingPayment.exists) {
      return res.status(200).json({
        success: true,
        message: "Payment already processed",
        transactionId: transactionKey
      });
    }

    // ---------------------------------------------------------
    // 8. ACTIVATE TASKORA PREMIUM
    // ---------------------------------------------------------

    const userRef = db
      .collection("users")
      .doc(String(userId));

    await db.runTransaction(async (transactionWriter) => {
      const paymentSnapshot =
        await transactionWriter.get(paymentRef);

      // Double-check inside transaction.
      if (paymentSnapshot.exists) {
        return;
      }

      transactionWriter.set(
        userRef,
        {
          premium: true,
          plan: "premium",
          premiumPlan: "monthly",

          premiumUpdatedAt:
            FieldValue.serverTimestamp(),

          flutterwaveTransactionId:
            transactionKey,

          flutterwaveAmount: amount,

          flutterwaveCurrency:
            currency
        },
        {
          merge: true
        }
      );

      // Save transaction so it cannot be processed again.
      transactionWriter.create(paymentRef, {
        app: "taskora",

        userId: String(userId),

        plan: "premium",

        amount,

        currency,

        transactionId: transactionKey,

        processedAt:
          FieldValue.serverTimestamp()
      });
    });

    // ---------------------------------------------------------
    // 9. SUCCESS
    // ---------------------------------------------------------

    console.log("Taskora Premium activated:", {
      userId: String(userId),
      transactionId: transactionKey,
      amount,
      currency
    });

    return res.status(200).json({
      success: true,
      message: "Taskora payment verified and Premium activated",
      transactionId: transactionKey
    });

  } catch (error) {
    console.error(
      "Taskora Flutterwave webhook error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to process payment webhook"
    });
  }
}
