function requireUser(context) {
  const user = context?.clientContext?.user;
  if (!user) return { ok: false, response: { statusCode: 401, body: "Unauthorized" } };

  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowed.length && !allowed.includes(user.email)) {
    return { ok: false, response: { statusCode: 403, body: "Forbidden" } };
  }

  return { ok: true, user };
}

module.exports = { requireUser };