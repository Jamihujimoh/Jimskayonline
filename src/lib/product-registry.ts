export type ProductGroup = 'core' | 'create' | 'learn' | 'play' | 'system';

export interface ProductDefinition {
  id: string;
  name: string;
  shortName: string;
  route: string;
  group: ProductGroup;
  description: string;
  status: 'ready' | 'beta' | 'utility';
}

export const PRODUCTS: ProductDefinition[] = [
  {
    id: 'chat',
    name: 'AI Chat',
    shortName: 'Chat',
    route: '/chat',
    group: 'core',
    description: 'Think through questions, plans, and decisions with Jimskay AI.',
    status: 'ready',
  },
  {
    id: 'studio',
    name: 'Studio',
    shortName: 'Studio',
    route: '/studio',
    group: 'create',
    description: 'Build, edit, and preview projects in a focused workspace.',
    status: 'ready',
  },
  {
    id: 'forge',
    name: 'Forge',
    shortName: 'Forge',
    route: '/forge',
    group: 'create',
    description: 'Generate and shape visual ideas, media, and assets.',
    status: 'beta',
  },
  {
    id: 'laboratory',
    name: 'Laboratory',
    shortName: 'Lab',
    route: '/laboratory',
    group: 'learn',
    description: 'Run structured experiments and turn questions into findings.',
    status: 'ready',
  },
  {
    id: 'academic',
    name: 'Study Lab',
    shortName: 'Study',
    route: '/academic',
    group: 'learn',
    description: 'Practice subjects, review concepts, and prepare with focus.',
    status: 'ready',
  },
  {
    id: 'intel',
    name: 'Web Intelligence',
    shortName: 'Intel',
    route: '/intel',
    group: 'core',
    description: 'Research the open web and organize useful evidence.',
    status: 'beta',
  },
  {
    id: 'game',
    name: 'Game Hub',
    shortName: 'Games',
    route: '/game',
    group: 'play',
    description: 'Play focused games for memory, logic, and reaction.',
    status: 'ready',
  },
  {
    id: 'identity',
    name: 'Identity',
    shortName: 'Profile',
    route: '/identity',
    group: 'system',
    description: 'Manage your profile, preferences, and workspace identity.',
    status: 'utility',
  },
  {
    id: 'vault',
    name: 'Vault',
    shortName: 'Vault',
    route: '/vault',
    group: 'system',
    description: 'Keep saved ideas, outputs, and important references together.',
    status: 'utility',
  },
];

export const PRODUCT_GROUP_LABELS: Record<ProductGroup, string> = {
  core: 'Core workspace',
  create: 'Create',
  learn: 'Learn',
  play: 'Play',
  system: 'Workspace',
};

export function getProduct(id: string): ProductDefinition | undefined {
  return PRODUCTS.find((product) => product.id === id);
}

export function getProductsByGroup(group: ProductGroup): ProductDefinition[] {
  return PRODUCTS.filter((product) => product.group === group);
}
