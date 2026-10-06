import { AppError } from '../utils/AppError.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// O UUID identifica a sessão do jogador; NÃO é autenticação.
export function requireSessionUuid(req, _res, next) {
  const raw = req.get('X-Session-UUID');
  if (!raw) return next(new AppError(400, 'SESSION_REQUIRED', 'Header X-Session-UUID ausente.'));
  if (!UUID_V4.test(raw)) {
    return next(new AppError(400, 'SESSION_INVALID', 'X-Session-UUID deve ser um UUID v4 válido.'));
  }
  req.sessionUuid = raw.toLowerCase();
  next();
}
