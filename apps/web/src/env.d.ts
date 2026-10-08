interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Folder aset Tesseract, diisi plugin di vite.config.ts. */
  readonly VITE_TESSERACT_PATH: string;
  /** Alamat situs produksi untuk canonical/OG/sitemap, diisi plugin di vite.config.ts. Kosong = tidak diketahui. */
  readonly VITE_SITE_URL: string;
}
