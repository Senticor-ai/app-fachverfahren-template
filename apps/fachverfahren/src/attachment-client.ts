// attachment-client — browser AttachmentPort against /api/v1/attachments*.
export interface AttachmentPort {
  upload(input: { file: Blob; fileName: string; purpose?: string }): Promise<{
    attachmentId: string;
    fileName: string;
    mediaType: string;
    sizeBytes: number;
    checksumSha256: string;
  }>;
  download(attachmentId: string): Promise<Blob>;
  delete(attachmentId: string): Promise<void>;
}

export function createAttachmentClient(): AttachmentPort {
  return {
    async upload({ file, fileName, purpose }) {
      const res = await fetch("/api/v1/attachments", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(fileName),
          "X-Attachment-Purpose": purpose ?? "nachweis",
        },
        body: file,
      });
      if (!res.ok) {
        throw new Error(`upload failed: ${res.status}`);
      }
      return (await res.json()) as {
        attachmentId: string;
        fileName: string;
        mediaType: string;
        sizeBytes: number;
        checksumSha256: string;
      };
    },
    async download(attachmentId) {
      const res = await fetch(
        `/api/v1/attachments/${encodeURIComponent(attachmentId)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      return res.blob();
    },
    async delete(attachmentId) {
      const res = await fetch(
        `/api/v1/attachments/${encodeURIComponent(attachmentId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok && res.status !== 204) {
        throw new Error(`delete failed: ${res.status}`);
      }
    },
  };
}
