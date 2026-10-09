// A plain message for a refused save. A broken check (23514) means something is too long
// or not allowed, which the form should normally stop before it gets that far.
export function saveError(error: { code?: string; message: string }) {
  if (error.code === '23514') return 'Some of that is too long. Shorten it and try again.';
  return error.message;
}
