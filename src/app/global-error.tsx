"use client";

import NextError from "next/error";
import { AppConfig } from "@/utils/AppConfig";

export default function GlobalError({
  error
}: {
  error: Error & { digest?: string };
}) {
  console.error("StoryCam global error", {
    digest: error.digest,
    name: error.name
  });

  return (
    <html lang={AppConfig.locale}>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
