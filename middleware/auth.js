/**
 * Middleware to restrict route access to authenticated admin users only.
 */
export function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  
  // Gracefully handle JSON requests by returning a 401 status, and browser requests by redirecting
  const acceptHeader = req.headers.accept || '';
  if (req.xhr || acceptHeader.includes('application/json') || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized. Please login first.' });
  }
  
  res.redirect('/admin-login');
}
