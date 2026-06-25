/** Blob → 浏览器下载。临时 a 标签，下载后 revoke 释放对象 URL。 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 微任务后 revoke，避免某些浏览器尚未启动下载就失效
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
