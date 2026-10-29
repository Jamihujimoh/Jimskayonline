"use client"
/**
 * Legacy preview route. Redirects to the live viewport.
 */
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function LegacyPreviewRedirect() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  useEffect(() => {
    if (projectId) {
      router.replace(`/studio/view/${projectId}`);
    } else {
      router.replace('/studio');
    }
  }, [router, projectId]);

  return null;
}
