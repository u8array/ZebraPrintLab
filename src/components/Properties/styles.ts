/** Re-export shim; the canonical location is `components/ui/formStyles.ts`.
 *  Kept so the 20+ registry/panel call sites that historically imported
 *  from this path keep working without a sweep. New code should import
 *  from `components/ui/formStyles` directly. */
export { inputCls, labelCls, buttonCls } from '../ui/formStyles';
