export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export function pageOf<T>(data: T[], page: number, pageSize: number, total: number) {
  return {
    data,
    meta: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
    } as PageMeta,
  };
}

export function skipOf(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
