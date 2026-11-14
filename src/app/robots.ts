import type { MetadataRoute } from "next";

/** Internal business system: nothing here should ever be indexed. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
