// api/flutterwave-webhook.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const secretHash = process.env.FLW_SECRET_HASH;
    const secretKey = process.env.FLW_SECRET_KEY;

    if (!secretHash || !secretKey) {
      console.error("Flutterwave environment variables are missing.");

      return res.status(500).json({
        success: false,
        message: "Webhook is not configured"
      });
    }

    // Flutterwave webhook signature verification
    const signature =
      req.headers["verif-hash"] ||
      req.headers["verif_hash"];

    if (!signature || signature !== secretHash) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature"
      });
    }

    const event = req.body;

    // Only process successful charge events.
    if (event?.event !== "charge.completed") {
      return res.status(200).json({
        success: true,
        message: "Event ignored"
      });
    }

    const transactionId = event?.data?.id;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Missing transaction ID"
      });
    }

    /*
     * IMPORTANT:
     * Never trust the amount/currency from the webhook alone.
     * Verify the transaction directly with Flutterwave.
     */

    const verifyResponse = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
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
      verification.status !== "success" ||
      verification.data?.status !== "successful"
    ) {
      return res.status(400).json({
        success: false,
        message: "Transaction was not successful"
      });
    }

    const transaction = verification.data;

    const amount = Number(transaction.amount);
    const currency = String(transaction.currency || "").toUpperCase();

    /*
     * Taskora prices:
     *
     * International = $2
     * Nigeria       = ₦2,000
     */

    const validPayment =
      (currency === "USD" && amount >= 2) ||
      (currency === "NGN" && amount >= 2000);

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

    /*
     * Identify the customer.
     *
     * The cleanest approach is to pass the user's Taskora ID
     * through Flutterwave metadata when creating the payment.
     */

    const metadata = transaction.meta || {};

    const userId =
      metadata.taskora_user_id ||
      metadata.user_id ||
      transaction.customer?.email;

    if (!userId) {
      console.error("No Taskora user identifier found.");

      return res.status(400).json({
        success: false,
        message: "Missing Taskora user identifier"
      });
    }

    /*
     * ==========================================================
     * PREMIUM ACTIVATION
     * ==========================================================
     *
     * DO NOT simply set localStorage from the frontend.
     *
     * Replace the section below with your database update once
     * you connect Firebase/Supabase/etc.
     *
     * Example:
     *
     * await updateTaskoraUser(userId, {
     *   premium: true,
     *   premiumPlan: "monthly",
     *   transactionId: String(transactionId)
     * });
     */

    console.log("Verified Taskora Premium payment:", {
      userId,
      transactionId,
      amount,
      currency,
      customerEmail: transaction.customer?.email || null
    });

    return res.status(200).json({
      success: true,
      message: "Taskora payment verified",
      transactionId: String(transactionId),
      userId
    });

  } catch (error) {
    console.error("Taskora webhook error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
