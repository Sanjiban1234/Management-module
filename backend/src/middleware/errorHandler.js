import { HttpError } from "../utils/index.js";

export function notFoundHandler(_request, _response, next) {
  next(new HttpError(404, "Route not found."));
}

export function errorHandler(error, _request, response, _next) {
  const statusCode = error.statusCode || 500;

  response.status(statusCode).json({
    error: {
      message: error.message || "Internal server error.",
      details: error.details || undefined
    }
  });
}

