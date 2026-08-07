declare module 'mammoth' {
  export function extractRawText(input: {
    buffer: Buffer
  }): Promise<{ value: string; messages: unknown[] }>
}

declare module 'pizzip' {
  export default class PizZip {
    constructor(data?: Buffer | Uint8Array | ArrayBuffer | string)
    file(name: string): { asText: () => string } | null
    generate(options: {
      type: string
      compression?: string
    }): Buffer | Uint8Array | string
  }
}

declare module 'docxtemplater' {
  import type PizZip from 'pizzip'
  export default class Docxtemplater {
    constructor(
      zip: PizZip,
      options?: {
        paragraphLoop?: boolean
        linebreaks?: boolean
        delimiters?: { start: string; end: string }
      }
    )
    render(data: Record<string, unknown>): void
    getZip(): PizZip
  }
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
