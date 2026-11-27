import { badRequest } from "./httpError.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const toPositiveInt = (value, name, fallback) => {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw badRequest(`${name} must be a positive integer`);
  return n;
};

// Reads ?page=&limit= from the query string. limit is capped at MAX_LIMIT.
export const parsePagination = (query) => {
  const page = toPositiveInt(query.page, "page", 1);
  const limit = Math.min(toPositiveInt(query.limit, "limit", DEFAULT_LIMIT), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};

export const paginationMeta = ({ page, limit }, total) => {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages };
};
