// Middleware para verificar rol de vendedor
export const isSeller = (req, res, next) => {
  if (req.user.role !== 'Vendedor') {
    return res.status(403).json({ error: 'Acceso prohibido: se requiere rol de vendedor' });
  }
  next();
};

// Middleware para verificar rol de consultor
export const isConsultant = (req, res, next) => {
  if (req.user.role !== 'Consultor') {
    return res.status(403).json({ error: 'Acceso prohibido: se requiere rol de consultor' });
  }
  next();
};