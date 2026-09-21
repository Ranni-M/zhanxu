// 单文件体积上限的前置提示。真正的闸门在服务端 server/config.ts，
// 两边的默认值保持同一套（服务端可用环境变量覆盖）。
export const uploadLimits = {
  imageMb: 25,
  pdfMb: 60,
  videoMb: 200,
  archiveMb: 200,
} as const;
export const uploadHint = `图片 ${uploadLimits.imageMb}MB / PDF ${uploadLimits.pdfMb}MB / 视频 ${uploadLimits.videoMb}MB / ZIP ${uploadLimits.archiveMb}MB`;
