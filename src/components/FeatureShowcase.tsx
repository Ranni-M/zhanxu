import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowsLeftRight,
  FileDoc,
  FilePdf,
  FileZip,
  FilmStrip,
  FrameCorners,
  Images,
  QrCode,
} from '@phosphor-icons/react';
import type { Project } from '../domain/project';
import { samples } from '../data';
import { uploadHint } from '../domain/limits';
import CompareSlider from './CompareSlider';
import PosterImage from './PosterImage';

// 版式示范用的三种组合：竖屏霓虹、方形纸本、打印封面——主题、骨架、尺寸同时在变
const storySample: Project = {
  ...samples[2],
  template: 'neon',
  skeleton: 'banner',
  posterSize: 'story',
};
const squareSample: Project = {
  ...samples[0],
  template: 'paper',
  skeleton: 'type-only',
  posterSize: 'square',
};
const printCover: Project = { ...samples[0], posterSize: 'print' };
const printInner: Project = {
  ...samples[1],
  template: 'kraft',
  skeleton: 'type-only',
  posterSize: 'print',
};

// 导入解析会读出来的字段，这里用真实的示例压缩包结果举例
const extractRows = [
  ['项目名称', '潮汐来信'],
  ['英文标题', 'LETTERS FROM THE SEA'],
  ['创作者', '林小满'],
  ['作品方向', '数字媒体'],
  ['图片顺序', '封面主视觉 → 过程记录-01'],
];

const layoutStats = [
  { value: '9', label: '套配色主题' },
  { value: '6', label: '种排版骨架' },
  { value: '5', label: '种输出尺寸' },
];

const assetRows = [
  { icon: <Images size={18} weight="light" />, name: '图片', note: '每个项目 24 张，自动生成封面' },
  { icon: <FilmStrip size={18} weight="light" />, name: '视频', note: 'MP4 / WebM 演示录屏' },
  { icon: <FileDoc size={18} weight="light" />, name: '论文 PDF', note: '浏览器里预览前 6 页' },
  {
    icon: <FileZip size={18} weight="light" />,
    name: '源码与素材',
    note: '整包上传，随作品一起公开',
  },
];

export default function FeatureShowcase({
  projects,
  importing,
  importText,
  onImportZip,
}: {
  projects: Project[];
  importing: boolean;
  importText: string;
  onImportZip: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfText, setPdfText] = useState('');
  const [qr, setQr] = useState('');
  const shared = projects.find((project) => project.publishedSlug);
  // 二维码指向真实地址：本机是 127.0.0.1，线上就是你的域名
  const qrUrl = window.location.origin + (shared ? '/p/' + shared.publishedSlug : '');
  useEffect(() => {
    let active = true;
    import('../lib/poster')
      .then(({ qrDataUrl }) => qrDataUrl(qrUrl, 320))
      .then((data) => {
        if (active) setQr(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [qrUrl]);
  async function downloadPdf() {
    setPdfBusy(true);
    setPdfText('正在排版作品集…');
    try {
      const { exportLocally } = await import('../lib/local-export');
      await exportLocally(samples[0], 'pdf', setPdfText);
      setPdfText('已生成 栖居之间-作品集.pdf：A4 竖版，可直接打印。');
    } catch (error) {
      setPdfText('生成失败：' + (error as Error).message);
    } finally {
      setPdfBusy(false);
    }
  }
  return (
    <div className="feature-grid">
      <article
        className="feature-cell feature-import reveal-item"
        style={{ '--item-index': 0 } as React.CSSProperties}
      >
        <div className="feature-head">
          <span className="feature-icon">
            <FileZip size={19} weight="bold" />
          </span>
          <h3>零填写导入</h3>
        </div>
        <p className="feature-copy">
          把整个毕设文件夹压成 .zip
          拖进来，标题、简介、创作者、年份、作品方向、图片顺序和版式自动填好，打开编辑器只需要微调。
        </p>
        <div className="feature-extract">
          <div className="feature-extract-head">
            <FileZip size={14} weight="bold" />
            <span>潮汐来信.zip</span>
            <ArrowRight size={13} weight="bold" />
            <span>已生成草稿</span>
          </div>
          <dl>
            {extractRows.map(([label, value]) => (
              <div key={label} className="feature-extract-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <label
          className={'feature-drop' + (dragging ? ' is-dropping' : '') + (importing ? ' busy' : '')}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
            setDragging(false);
          }}
          onDrop={(event) => {
            const file = event.dataTransfer.files[0];
            setDragging(false);
            if (!file) return;
            event.preventDefault();
            onImportZip(file);
          }}
        >
          <FileZip size={27} weight="light" />
          <strong>
            {importing ? '正在自动填写…' : dragging ? '松手，剩下的交给展序' : '把 .zip 拖到这里'}
          </strong>
          <span>
            {importing
              ? importText
              : dragging
                ? '文字、图片和配色都会自动落位。'
                : '也可以在上方点「导入压缩包」挑文件。'}
          </span>
          <input
            type="file"
            accept=".zip,application/zip"
            aria-label="导入压缩包示例"
            disabled={importing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onImportZip(file);
            }}
          />
        </label>
      </article>
      <article
        className="feature-cell feature-layout reveal-item"
        style={{ '--item-index': 1 } as React.CSSProperties}
      >
        <div className="feature-head">
          <span className="feature-icon">
            <FrameCorners size={19} weight="bold" />
          </span>
          <h3>九套主题，六种排版</h3>
        </div>
        <p className="feature-copy">
          同一份内容换一套版式就是另一种气质，尺寸决定它出现在朋友圈、展板还是答辩材料里。
        </p>
        <div className="feature-prints">
          <PosterImage project={storySample} width={300} />
          <PosterImage project={squareSample} width={300} />
        </div>
        <dl className="feature-stats">
          {layoutStats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.value}</dt>
              <dd>{stat.label}</dd>
            </div>
          ))}
        </dl>
      </article>
      <article
        className="feature-cell feature-compare reveal-item"
        style={{ '--item-index': 2 } as React.CSSProperties}
      >
        <div className="feature-head">
          <span className="feature-icon">
            <ArrowsLeftRight size={19} weight="bold" />
          </span>
          <h3>改动前后一键对比</h3>
        </div>
        <p className="feature-copy">
          两个方案、两个版本叠在同一张图上，拖动滑杆就能讲清「为什么改」。
        </p>
        <CompareSlider
          before="/images/interior.jpg"
          after="/images/architecture.jpg"
          beforeLabel="方案 A"
          afterLabel="方案 B"
        />
      </article>
      <article
        className="feature-cell feature-pdf reveal-item"
        style={{ '--item-index': 3 } as React.CSSProperties}
      >
        <div className="feature-head">
          <span className="feature-icon">
            <FilePdf size={19} weight="bold" />
          </span>
          <h3>作品集 PDF</h3>
        </div>
        <p className="feature-copy">
          A4 多页排版，自动生成目录、页码和装订边，打印出来就是一本能翻的作品集。
        </p>
        <div className="feature-pages">
          <figure className="feature-page">
            <PosterImage project={printCover} width={520} />
            <figcaption>封面</figcaption>
          </figure>
          <figure className="feature-page">
            <PosterImage project={printInner} width={520} />
            <figcaption>文字内页</figcaption>
          </figure>
        </div>
        <button
          className="button secondary feature-action"
          onClick={downloadPdf}
          disabled={pdfBusy}
        >
          <FilePdf size={17} weight="bold" />
          {pdfBusy ? '正在排版…' : '下载示例作品集 PDF'}
        </button>
        {pdfText && (
          <small className="feature-status" role="status">
            {pdfText}
          </small>
        )}
      </article>
      <article
        className="feature-cell feature-qr reveal-item"
        style={{ '--item-index': 4 } as React.CSSProperties}
      >
        <div className="feature-qr-frame">
          {qr ? (
            <img src={qr} alt={'指向 ' + qrUrl + ' 的二维码'} width={320} height={320} />
          ) : (
            <div className="skeleton qr-skeleton" aria-hidden="true" />
          )}
        </div>
        <div className="feature-qr-copy">
          <div className="feature-head">
            <span className="feature-icon">
              <QrCode size={19} weight="bold" />
            </span>
            <h3>展台二维码</h3>
          </div>
          <p className="feature-copy">
            发布后每个作品都有自己的二维码。贴在展板上、印在作品集扉页，评委扫码就能看到完整项目。
          </p>
          <code className="feature-url">{qrUrl.replace(/^https?:\/\//, '')}</code>
          <small>
            {shared
              ? '二维码指向「' + (shared.title || '公开作品') + '」'
              : '发布作品后，这里会换成它的专属二维码'}
          </small>
        </div>
      </article>
      <article
        className="feature-cell feature-assets reveal-item"
        style={{ '--item-index': 5 } as React.CSSProperties}
      >
        <div className="feature-head">
          <span className="feature-icon">
            <Images size={19} weight="bold" />
          </span>
          <h3>素材一次收齐</h3>
        </div>
        <p className="feature-copy">图片、视频、论文和源码包放在一个项目里，谁都能一次看全。</p>
        <ul className="feature-asset-list">
          {assetRows.map((row) => (
            <li key={row.name}>
              {row.icon}
              <div>
                <strong>{row.name}</strong>
                <span>{row.note}</span>
              </div>
            </li>
          ))}
        </ul>
        <small className="feature-limits">单文件上限 {uploadHint}</small>
      </article>
    </div>
  );
}
