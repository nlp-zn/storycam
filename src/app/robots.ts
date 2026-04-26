import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/utils/Url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/"]
    },
    sitemap: `${getBaseUrl()}/sitemap.xml`
  };
}
