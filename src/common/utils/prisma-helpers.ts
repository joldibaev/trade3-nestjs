/**
 * Parses a comma-separated string of relations into a Prisma 'include' object.
 *
 * @example
 * parseInclude('products,category') // returns { products: true, category: true }
 *
 * @param include - Comma-separated string of relation names
 * @returns A Prisma-compatible include object or undefined if input is empty
 */
export function parseInclude(include?: string | string[]): Record<string, boolean> | undefined {
  if (!include) return undefined;

  const includeArray = Array.isArray(include) ? include : [include];
  const includeObject: Record<string, boolean> = {};

  includeArray.forEach((item) => {
    const relations = item.split(',');
    relations.forEach((rel) => {
      const trimmed = rel.trim();
      if (trimmed) {
        includeObject[trimmed] = true;
      }
    });
  });

  return Object.keys(includeObject).length > 0 ? includeObject : undefined;
}
