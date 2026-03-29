// Marketplace category definitions — 20 categories with subcategories

export const CATEGORIES = [
  { id: 'development', name: 'Development', icon: '{ }', subs: ['Code Review', 'Debugging', 'DevOps', 'API Integration', 'Testing'] },
  { id: 'defi-trading', name: 'DeFi & Trading', icon: '\u{1F4CA}', subs: ['Trading Bots', 'Yield Farming', 'Portfolio Tracking', 'Arbitrage'] },
  { id: 'blockchain-web3', name: 'Blockchain & Web3', icon: '\u26D3', subs: ['Smart Contracts', 'Cross-Chain', 'DAO Tooling', 'NFT', 'Tokenomics'] },
  { id: 'datasets', name: 'Datasets', icon: '\u{1F5C4}', subs: ['Public Datasets', 'Curated Collections', 'Live Feeds', 'Training Data', 'Market Data', 'On-Chain Data'] },
  { id: 'data-analytics', name: 'Data & Analytics', icon: '\u{1F4C8}', subs: ['Data Pipelines', 'Visualization', 'BI', 'Scraping', 'Forecasting'] },
  { id: 'content-media', name: 'Content & Media', icon: '\u{1F3AC}', subs: ['Writing', 'Image Gen', 'Video', 'Social Media', 'Translation'] },
  { id: 'security-auditing', name: 'Security & Auditing', icon: '\u{1F512}', subs: ['Contract Audits', 'Pen Testing', 'Threat Analysis', 'Monitoring'] },
  { id: 'research', name: 'Research', icon: '\u{1F50D}', subs: ['Market Research', 'Academic', 'Competitive Intel', 'Due Diligence'] },
  { id: 'customer-support', name: 'Customer Support', icon: '\u{1F4AC}', subs: ['Chatbots', 'Ticket Triage', 'FAQ', 'Onboarding Flows'] },
  { id: 'marketing-seo', name: 'Marketing & SEO', icon: '\u{1F4E2}', subs: ['Ad Campaigns', 'SEO', 'Email', 'Growth', 'Lead Gen'] },
  { id: 'finance-accounting', name: 'Finance & Accounting', icon: '\u{1F4B0}', subs: ['Bookkeeping', 'Tax', 'Invoicing', 'Financial Planning'] },
  { id: 'legal-compliance', name: 'Legal & Compliance', icon: '\u2696\uFE0F', subs: ['Contract Review', 'Regulatory', 'KYC/AML', 'Policy Drafting'] },
  { id: 'design-creative', name: 'Design & Creative', icon: '\u{1F3A8}', subs: ['UI/UX', 'Branding', 'Graphic Design', 'Prototyping'] },
  { id: 'identity-privacy', name: 'Identity & Privacy', icon: '\u{1F6E1}', subs: ['VerusID Mgmt', 'Data Sovereignty', 'Encryption', 'Access Control'] },
  { id: 'education-training', name: 'Education & Training', icon: '\u{1F4DA}', subs: ['Tutoring', 'Course Creation', 'Skill Assessment', 'Documentation'] },
  { id: 'infrastructure-ops', name: 'Infrastructure & Ops', icon: '\u{1F5A5}', subs: ['Server Mgmt', 'CI/CD', 'Monitoring', 'Deployment', 'Backups'] },
  { id: 'wellness-fitness', name: 'Wellness & Fitness', icon: '\u{1F9D8}', subs: ['Nutrition Plans', 'Workout Coaching', 'Sleep', 'Habit Tracking'] },
  { id: 'personal-growth', name: 'Personal Growth', icon: '\u{1F331}', subs: ['Life Coaching', 'Journaling', 'Therapy Support', 'Mindfulness'] },
  { id: 'companions-social', name: 'Companions & Social', icon: '\u{1F49A}', subs: ['Conversation', 'Roleplay', 'Language Practice', 'Social Skills'] },
  { id: 'entertainment-gaming', name: 'Entertainment & Gaming', icon: '\u{1F3AE}', subs: ['Game Strategy', 'Storytelling', 'Trivia', 'Music', 'World-Building'] },
  { id: 'lifestyle-productivity', name: 'Lifestyle & Productivity', icon: '\u2728', subs: ['Personal Finance', 'Meal Planning', 'Travel', 'Styling', 'Daily Planning'] },
];

// Map category name -> id for reverse lookup
export const CATEGORY_NAME_TO_ID = Object.fromEntries(CATEGORIES.map(c => [c.name, c.id]));

// Find category by id
export function getCategoryById(id) {
  return CATEGORIES.find(c => c.id === id);
}
