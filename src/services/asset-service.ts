import type { UploadedAsset } from '../lib/api';
import { uploadAsset } from '../lib/api';
import { imageData } from '../lib/import';
import { isGuestMode } from './project-service';
const IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
/**
 * 素材入库的唯一入口：登录了传到服务器，游客模式就压成 data URL 存在浏览器里。
 * 组装器不需要知道自己处在哪种模式。
 */
export function putAsset(
  projectId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadedAsset> {
  if (!isGuestMode()) return uploadAsset(projectId, file, onProgress);
  if (!IMAGES.includes(file.type))
    return Promise.reject(new Error('还没登录时只能加图片；视频和 PDF 登录后再传。'));
  onProgress(20);
  return imageData(file).then((src) => {
    onProgress(100);
    return {
      id: 'guest-' + crypto.randomUUID(),
      src,
      name: file.name.replace(/\.[^.]+$/, ''),
      kind: 'image' as const,
      size: file.size,
      visible: true,
    };
  });
}
/** 游客草稿搬迁到账号时用得上：data URL 换回二进制再传给服务器 */
export async function dataUrlFile(src: string, name: string) {
  const blob = await (await fetch(src)).blob();
  return new File([blob], name + '.jpg', { type: blob.type || 'image/jpeg' });
}
