import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export function notFound(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erro interno do servidor.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Dados inválidos.';
    details = err.flatten();
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400; code = 'VALIDATION_ERROR'; message = err.message;
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400; code = 'INVALID_ID'; message = 'Identificador inválido.';
  } else if (err?.code === 11000) {
    status = 409; code = 'DUPLICATE'; message = 'Registro duplicado.';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'JSON malformado no corpo da requisição.';
  } else if (err?.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Corpo da requisição grande demais.';
  }

  if (status >= 500) console.error(err);

  res.status(status).json({
    error: {
      code,
      message,
      ...(details && { details }),
      ...(env.NODE_ENV !== 'production' && status >= 500 && { stack: err.stack }),
    },
  });
}
