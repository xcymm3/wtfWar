export function normalizeCharacterName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}
