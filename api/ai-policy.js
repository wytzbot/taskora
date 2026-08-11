// Taskora AI cost-control policy
// Server-side only. Never trust client-side quota or premium flags.
const PLANS = Object.freeze({
  free: { dailyActions: 3, maxOutputTokens: 450 },
  premium: { dailyActions: 30, maxOutputTokens: 600 }
});

function compactContext(context = {}) {
  const pick = (v, n=12) => Array.isArray(v) ? v.slice(0,n) : [];
  return {
    today: context.today || "",
    tasks: pick(context.tasks),
    deadlines: pick(context.deadlines),
    exams: pick(context.exams),
    courses: pick(context.courses),
    availableMinutes: Number(context.availableMinutes || 0)
  };
}

function getPlan(isPremium) {
  return isPremium ? PLANS.premium : PLANS.free;
}

export { PLANS, compactContext, getPlan };
