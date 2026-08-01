declare module 'mammoth' {
  export function extractRawText(input: {
    buffer: Buffer
  }): Promise<{ value: string; messages: unknown[] }>
}

declare module 'officeparser' {
  export type OfficeAst = {
    to: (format: string) => Promise<string>
    toText: () => string
  }

  export function parseOffice(
    file: Buffer | string,
    config?: Record<string, unknown>
  ): Promise<OfficeAst>

  const officeParser: {
    parseOffice: typeof parseOffice
  }
  export default officeParser
}
