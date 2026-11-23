import { useEffect, useState } from 'react'
import { getIssueImage, readImageSize } from './screenshots'
import type { IssueImage } from './types'

export function imageAlt(img: IssueImage, index: number) {
  return img.alt.trim() || `Screenshot ${index + 1} (no description yet)`
}

/** Object URL for an in-memory blob, or for a stored issue image loaded from IndexedDB. */
export function useIssueImageUrl(id: string, blob?: Blob) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    const show = (b: Blob | null) => {
      if (cancelled || !b) return
      objectUrl = URL.createObjectURL(b)
      setUrl(objectUrl)
    }
    if (blob) show(blob)
    else void getIssueImage(id).then(show, () => undefined)
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id, blob])
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
