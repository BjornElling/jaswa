// Swarfarm supplies image filenames, but downloading thousands of images as
// part of a data refresh would create unnecessary external traffic. Only files
// deliberately bundled under public/monster-images may be rendered as images.
export const localMonsterImageFilenames = new Set([
  'unit_icon_0001_0_0.png',
  'unit_icon_0001_1_4.png',
  'unit_icon_0001_3_4.png',
  'unit_icon_0001_4_4.png',
  'unit_icon_0002_0_1.png',
  'unit_icon_0003_0_2.png',
  'unit_icon_0003_4_0.png',
  'unit_icon_0051_0_0.png',
  'unit_icon_0051_1_0.png',
  'unit_icon_0051_1_1.png',
  'unit_icon_0051_2_1.png',
  'unit_icon_0051_2_2.png',
  'unit_icon_0051_3_0.png',
  'unit_icon_0060_1_2.png',
  'unit_icon_0089_1_3.png',
]);
