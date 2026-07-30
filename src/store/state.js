export const DATA_KEYS = {
  category: 'หมวดหมู่',
  colorName: 'สี',
  stock: 'สต๊อก',
  order: 'ออเดอร์',
  productCode: 'รหัสสินค้า'
};

export const state = {
  rawData: [],
  inventoryAdjustments: [],
  groupedData: {},
  storeRawData: [],
  activeCategories: new Set(),
  currentCategories: ['all'],
  isPresentationMode: false,
  showOnlyActive: false,
  showOnlyStock: false,
  customCategoryOrder: [],
  storeSearchDebounceTimeout: null,
  currentStoreDetailName: null,
  sortableInstance: null,
  activeStoreListFilter: 'ทั้งหมด',
  imageCache: {}
};
