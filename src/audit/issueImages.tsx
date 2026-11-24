import { useEffect, useState } from 'react'
import { readImageSize } from './browserArchive'
import { signedUrl } from './supabase'
import type { IssueImage } from './types'

export function imageAlt(img: IssueImage, index: number) {
  return img.alt.trim() || `Screenshot ${index + 1} (no description yet)`
}

/** Object URL for an in-memory blob, or a short-lived signed URL for an uploaded image. */
export function useImageUrl(path: string, blob?: Blob) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    setUrl(null)
    if (blob) {
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    } else if (path) {
      void signedUrl(path).then(
        (u) => !cancelled && setUrl(u),
        () => undefined,
      )
    }
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, blob])
  return url
}

export function imageFilesFrom(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return []
  const files: File[] = []
  for (const entry of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = entry instanceof File ? entry : entry.kind === 'file' ? entry.getAsFile() : null
    if (file && file.type.startsWith('image/')) files.push(file)
  }
  return files
}

export async function toIssueImage(file: File): Promise<{ meta: IssueImage; blob: Blob }> {
  const size = await readImageSize(file)
  const ext = file.type.split('/')[1] || 'png'
  const meta: IssueImage = {
    id: crypto.randomUUID(),
    path: '',
    name: file.name && file.name !== 'image.png' ? file.name : `pasted-screenshot.${ext}`,
    type: file.type,
    size: file.size,
    width: size.width,
    height: size.height,
    alt: '',
    createdAt: new Date().toISOString(),
  }
  return { meta, blob: file }
}
