import {formatMoney, productCurrency, productFinancials, type LabRecord} from './domain.ts';
import {productStage} from './product-stage.ts';

export function canSaveSceneDraft(prompt: string, blocked = false) {
  return !blocked && prompt.trim().length > 0;
}

export function showWorkspaceBanner(records: readonly LabRecord[], demo: boolean, loading: boolean) {
  // Keep the way back to the user's workspace visible while browsing sample data.
  return !loading && (demo || !records.some(record => record.kind === 'product'));
}

export function productCardDetails(product: LabRecord, records: readonly LabRecord[]) {
  const financials = productFinancials(product.data);
  const amount = (field: 'cost' | 'shipping') => typeof financials[field] === 'number' && Number.isFinite(financials[field])
    ? formatMoney(financials[field], productCurrency(financials, field)) : 'chưa biết';
  return {
    costLabel: `Vốn ${amount('cost')} + ship ${amount('shipping')}`,
    accountCount: records.filter(record => record.kind === 'social_account' && record.data.productId === product.id && !record.data.archived).length,
    stage: productStage(product, records),
  };
}
