import type { Project, TemplateId } from '../domain/project.ts';
export const categories = [
  '全部作品',
  '视觉传达',
  '数字媒体',
  '空间设计',
  '产品设计',
  '软件开发',
  '动画影视',
  '其他',
];
export const templates: {
  id: TemplateId;
  name: string;
  english: string;
  description: string;
  color: string;
}[] = [
  {
    id: 'editorial',
    name: '编辑叙事',
    english: 'Editorial',
    description: '清晰的文字层级，让项目故事自然展开。',
    color: '#e65938',
  },
  {
    id: 'gallery',
    name: '留白画廊',
    english: 'Gallery',
    description: '把空间留给作品，让每一处细节被看见。',
    color: '#526659',
  },
  {
    id: 'bold',
    name: '大字宣言',
    english: 'Statement',
    description: '鲜明的色彩和大胆的标题，先声夺人。',
    color: '#d4ef75',
  },
];
export const samples: Project[] = [
  {
    id: 'sample-space',
    title: '栖居之间',
    subtitle: 'BETWEEN SPACES',
    author: '展序设计示例',
    category: '空间设计',
    year: '2026',
    intro:
      '以建筑的几何秩序为起点，探索光线、结构与人的关系。用留白与节奏，重新看见日常生活中的空间。',
    process: '观察建筑结构与光影变化，收集视觉参考，再通过图像编排构建空间叙事。',
    template: 'editorial',
    images: [
      { id: 'a', src: '/images/architecture.jpg', name: '空间与几何' },
      { id: 'b', src: '/images/interior.jpg', name: '日常生活的尺度' },
    ],
    updatedAt: 0,
    sample: true,
  },
  {
    id: 'sample-ocean',
    title: '潮汐来信',
    subtitle: 'LETTERS FROM THE SEA',
    author: '展序设计示例',
    category: '数字媒体',
    year: '2026',
    intro:
      '把海面的细微波动转化为视觉语言，记录流动、停顿与回响。这是一份关于自然节奏的影像展示概念。',
    process: '收集海面影像，研究流动的纹理与色彩，完成视觉概念和版式编排。',
    template: 'gallery',
    images: [{ id: 'c', src: '/images/ocean.jpg', name: '海面的呼吸' }],
    updatedAt: 0,
    sample: true,
  },
  {
    id: 'sample-leaf',
    title: '一叶之间',
    subtitle: 'A LITTLE CLOSER TO NATURE',
    author: '展序设计示例',
    category: '视觉传达',
    year: '2026',
    intro: '从森林的层次与光线中提取视觉秩序，以简洁的版式表达人与自然之间的连接。',
    process: '自然影像采集、色彩研究、视觉语言探索与应用延展。',
    template: 'bold',
    images: [{ id: 'd', src: '/images/forest.jpg', name: '森林光影' }],
    updatedAt: 0,
    sample: true,
  },
  {
    id: 'sample-room',
    title: '日常的留白',
    subtitle: 'ROOM FOR EVERYDAY',
    author: '展序设计示例',
    category: '产品设计',
    year: '2026',
    intro: '以居住空间为灵感，观察器物、材质和光线怎样影响日常体验。通过图像与文字呈现设计思考。',
    process: '场景观察、材质分析、概念推导、展示设计。',
    template: 'gallery',
    images: [{ id: 'e', src: '/images/interior.jpg', name: '人与物的相处' }],
    updatedAt: 0,
    sample: true,
  },
];
