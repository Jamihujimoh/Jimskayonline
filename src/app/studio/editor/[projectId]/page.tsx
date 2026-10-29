"use client"
/**
 * Legacy editor route. Redirects to the unified workspace.
 */
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function LegacyEditorRedirect() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  useEffect(() => {
    if (projectId) {
      router.replace(`/studio/workspace/${projectId}`);
    } else {
      router.replace('/studio');
    }
  }, [router, projectId]);

  return null;
}
