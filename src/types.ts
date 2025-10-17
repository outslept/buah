export type FileEntry = {
  path: string;
  content: string;
};

export type RegistryItem = {
  files: FileEntry[];
};

export type Registry = Record<string, RegistryItem>;
