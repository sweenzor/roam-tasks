export function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "BAD_REQUEST";
  return error;
}

export function forbidden(message) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = "FORBIDDEN";
  return error;
}

export function unsupportedMediaType(message) {
  const error = new Error(message);
  error.statusCode = 415;
  error.code = "UNSUPPORTED_MEDIA_TYPE";
  return error;
}

export function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  return error;
}

export function serviceUnavailable(message) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = "ROAM_UNAVAILABLE";
  return error;
}
