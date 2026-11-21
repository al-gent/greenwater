export function projectWriteError(error: { code?: string; message?: string }) {
  const status = { PT400: 400, PT403: 403, PT404: 404, PT409: 409 }[error.code ?? '']
  if (status) return { status, error: error.message ?? 'Could not save changes' }
  if (error.code === '23P01') return { status: 409, error: 'The vessel or a researcher is no longer free on those dates' }
  if (error.code === '23505' || error.code === '40001' || error.code === '40P01') return { status: 409, error: 'Another change conflicted with this request. Refresh and try again.' }
  if (error.code === '23503') return { status: 400, error: 'A selected item no longer exists. Refresh and try again.' }
  if (error.code === '23514' || error.code === '22P02' || error.code === '22007' || error.code === '22008') return { status: 400, error: 'Invalid values. Check the dates and selected items.' }
  return { status: 500, error: 'Could not save changes. Please try again.' }
}
