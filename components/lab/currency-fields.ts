import { candidateCurrencySchema } from "@/lib/lab/operations";
import type { FieldDef } from "./primitives";

const currencyOptions = candidateCurrencySchema.options.map(value => ({value, label: value}));
const overrides = [{value: "", label: "Theo tiền tệ chung"}, ...currencyOptions];

// Shared by candidate and product editors so stored units remain visible.
export const currencyFields: FieldDef[] = [
  {name: "currency", label: "Tiền tệ chung", type: "select", options: currencyOptions, help: "Tiền tệ giá bán; không tự quy đổi tỷ giá."},
  {name: "costCurrency", label: "Tiền tệ giá vốn", type: "select", nullable: true, options: overrides},
  {name: "shippingCurrency", label: "Tiền tệ ship", type: "select", nullable: true, options: overrides},
];
