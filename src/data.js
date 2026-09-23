export const seedProducts = [
  { id: 'p1', name: 'Seda King Size Slim', price: 7.5, stock: 24, active: true },
  { id: 'p2', name: 'Piteira Premium 6 mm', price: 9.9, stock: 2, active: true },
  { id: 'p3', name: 'Isqueiro Clipper', price: 12.0, stock: 9, active: true },
  { id: 'p4', name: 'Dichavador Metal 4 Partes', price: 42.0, stock: 1, active: true },
  { id: 'p5', name: 'Bandeja Prisma M', price: 36.0, stock: 7, active: true },
  { id: 'p6', name: 'Case Hermético Pocket', price: 28.5, stock: 12, active: true },
];

export const catalogProducts = [
  { id: 'catalog-eduardo-teste', name: 'Eduardo teste', price: 0.01, stock: 3, active: true },
  { id: 'catalog-dry-5g', name: 'Dry 5g', price: 175, stock: 10, active: true },
  { id: 'catalog-gisele', name: 'Gisele', price: 70, stock: 20, active: true },
  { id: 'catalog-4un-abacaxi', name: '@ 4un (abacaxi)', price: 130, stock: 10, active: true },
  {
    id: 'catalog-generic-01',
    name: 'Item A',
    price: 150,
    stock: 10,
    active: true,
    quantityPricing: {
      exactTotals: { 2: 280, 3: 405 },
      minQuantity: 5,
      unitPrice: 125,
    },
  },
  { id: 'catalog-generic-02', name: 'Item B', price: 175, stock: 10, active: true },
  { id: 'catalog-generic-03', name: 'Item C', price: 125, stock: 10, active: true },
  { id: 'catalog-generic-04', name: 'Item D', price: 60, stock: 10, active: true },
  { id: 'catalog-generic-05', name: 'Item E', price: 130, stock: 10, active: true },
  { id: 'catalog-generic-06', name: 'Item F', price: 150, stock: 10, active: true },
  { id: 'catalog-generic-07', name: 'Item G', price: 100, stock: 10, active: true },
];

export const seedCustomers = [
  {
    id: 'c1', name: 'Lucas Almeida', phone: '+55 11 98888-1204', totalSpent: 684.4, orderCount: 9,
    addresses: [
      { street: 'Rua Aurora', number: '120', complement: 'Apto 31', neighborhood: 'Santa Cecília', city: 'São Paulo', state: 'SP', zip: '01209-000', usedAt: '2026-08-20' },
      { street: 'Rua Augusta', number: '555', complement: 'Apto 82', neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', zip: '01305-000', usedAt: '2026-09-13' },
    ],
    lastOrderAt: '2026-09-13T20:21:00.000Z', addressChanged: true,
  },
  {
    id: 'c2', name: 'Mariana Costa', phone: '+55 11 97777-3399', totalSpent: 392.9, orderCount: 6,
    addresses: [{ street: 'Rua Clélia', number: '808', complement: '', neighborhood: 'Lapa', city: 'São Paulo', state: 'SP', zip: '05042-000', usedAt: '2026-09-10' }],
    lastOrderAt: '2026-09-12T18:09:00.000Z', addressChanged: false,
  },
  {
    id: 'c3', name: 'Rafael Nunes', phone: '+55 11 96666-7420', totalSpent: 156.0, orderCount: 2,
    addresses: [{ street: 'Av. Ibirapuera', number: '2200', complement: 'Bloco B', neighborhood: 'Moema', city: 'São Paulo', state: 'SP', zip: '04028-002', usedAt: '2026-09-01' }],
    lastOrderAt: '2026-09-11T14:45:00.000Z', addressChanged: false,
  },
];

export const seedOrders = [
  {
    id: 'PS-1048', customerId: 'c1', customerName: 'Lucas Almeida', phone: '+55 11 98888-1204',
    status: 'PAID', deliveryType: 'local_delivery', total: 79.8, createdAt: '2026-09-13T20:21:00.000Z', paidAt: '2026-09-13T20:23:00.000Z', receivingAccountId: 'pix-local',
    items: [{ productId: 'p1', name: 'Seda King Size Slim', quantity: 2, unitPrice: 7.5 }, { productId: 'p4', name: 'Dichavador Metal 4 Partes', quantity: 1, unitPrice: 42 }],
    address: { street: 'Rua Augusta', number: '555', complement: 'Apto 82', neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', zip: '01305-000' }, newAddress: true,
    deliveryFee: 22.8,
  },
  {
    id: 'PS-1047', customerId: 'c2', customerName: 'Mariana Costa', phone: '+55 11 97777-3399',
    status: 'PACKING', deliveryType: 'shipping', total: 92.4, createdAt: '2026-09-13T18:02:00.000Z', paidAt: '2026-09-13T18:04:00.000Z', receivingAccountId: 'pix-local',
    items: [{ productId: 'p5', name: 'Bandeja Prisma M', quantity: 1, unitPrice: 36 }, { productId: 'p6', name: 'Case Hermético Pocket', quantity: 1, unitPrice: 28.5 }],
    address: { street: 'Rua Clélia', number: '808', complement: '', neighborhood: 'Lapa', city: 'São Paulo', state: 'SP', zip: '05042-000' }, newAddress: false,
    deliveryFee: 27.9,
  },
  {
    id: 'PS-1046', customerId: 'c3', customerName: 'Rafael Nunes', phone: '+55 11 96666-7420',
    status: 'DELIVERED', deliveryType: 'local_delivery', total: 66.0, createdAt: '2026-09-12T14:45:00.000Z', paidAt: '2026-09-12T14:47:00.000Z', receivingAccountId: 'pix-local',
    items: [{ productId: 'p3', name: 'Isqueiro Clipper', quantity: 2, unitPrice: 12 }, { productId: 'p1', name: 'Seda King Size Slim', quantity: 2, unitPrice: 7.5 }],
    address: { street: 'Av. Ibirapuera', number: '2200', complement: 'Bloco B', neighborhood: 'Moema', city: 'São Paulo', state: 'SP', zip: '04028-002' }, newAddress: false,
    deliveryFee: 27,
  },
  { id: 'PS-1045', customerId: 'c1', customerName: 'Lucas Almeida', phone: '+55 11 98888-1204', status: 'PAID', deliveryType: 'shipping', total: 118.5, createdAt: '2026-09-10T17:12:00.000Z', paidAt: '2026-09-10T17:14:00.000Z', receivingAccountId: 'pix-local', items: [{ productId: 'p6', name: 'Case Hermético Pocket', quantity: 3, unitPrice: 28.5 }], address: { street: 'Rua Aurora', number: '120', complement: 'Apto 31', neighborhood: 'Santa Cecília', city: 'São Paulo', state: 'SP', zip: '01209-000' }, newAddress: false, deliveryFee: 33 },
  { id: 'PS-1044', customerId: 'c2', customerName: 'Mariana Costa', phone: '+55 11 97777-3399', status: 'PAID', deliveryType: 'local_delivery', total: 54.9, createdAt: '2026-09-08T19:12:00.000Z', paidAt: '2026-09-08T19:15:00.000Z', receivingAccountId: 'pix-local', items: [{ productId: 'p2', name: 'Piteira Premium 6 mm', quantity: 2, unitPrice: 9.9 }], address: { street: 'Rua Clélia', number: '808', complement: '', neighborhood: 'Lapa', city: 'São Paulo', state: 'SP', zip: '05042-000' }, newAddress: false, deliveryFee: 35.1 },
];

export const receivingAccounts = [
  { id: 'pix-local', name: 'Pix Oscar', accent: 'emerald' },
];
