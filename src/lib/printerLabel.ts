/** Picker label: the name, suffixed "· ZPL?" when it looks ZPL-capable so the
 *  user can spot the Zebra among unrelated print queues. */
export function printerOptionLabel(name: string, isZebra: boolean): string {
  return isZebra ? `${name} · ZPL?` : name;
}
