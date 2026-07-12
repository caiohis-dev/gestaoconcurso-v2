import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface AccessCodeEmailProps {
  name?: string
  code?: string
  siteName?: string
  siteUrl?: string
  logoUrl?: string
}

const Email = ({ name, code, siteName, siteUrl, logoUrl }: AccessCodeEmailProps) => {
  const displayCode = code || '0000'
  const displayName = name || 'Colaborador'
  const displaySite = siteName || 'FEVRE'
  const displayLogo = logoUrl || 'https://fevre.online/fevre-logo.png'

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head>
        <style>
          {`
            @media only screen and (max-width: 600px) {
              .code-box { font-size: 28px !important; padding: 16px !important; }
              .container { padding: 24px 16px !important; }
            }
          `}
        </style>
      </Head>
      <Preview>Seu código de acesso é {displayCode}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Img
              src={displayLogo}
              alt={`Logo ${displaySite}`}
              width={160}
              height={80}
              style={logoImg}
            />
          </Section>

          <Heading style={heading}>Olá, {displayName}!</Heading>

          <Text style={paragraph}>
            Você solicitou o código de acesso para o sistema do <strong>{displaySite}</strong>.
            Use o código abaixo para entrar na plataforma.
          </Text>

          <Section style={codeSection}>
            <Text style={codeLabel}>Código de acesso</Text>
            <Text style={codeBox}>{displayCode}</Text>
          </Section>

          <Text style={note}>
            Este código é pessoal e intransferível. Não o compartilhe com ninguém.
          </Text>

          {siteUrl && (
            <Section style={buttonSection}>
              <Button href={siteUrl} style={button}>
                Acessar o sistema
              </Button>
            </Section>
          )}

          <Text style={footer}>
            Se você não solicitou este código, entre em contato com o administrador do sistema.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Seu código de acesso — FEVRE',
  displayName: 'Código de Acesso',
  previewData: {
    name: 'Maria Silva',
    code: '7391',
    siteName: 'FEVRE',
    siteUrl: 'https://fevre.online/auth',
    logoUrl: 'https://fevre.online/fevre-logo.png',
  },
} satisfies TemplateEntry

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  color: 'hsl(0 0% 10%)',
  lineHeight: '1.6',
}

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '24px 24px 32px',
  backgroundColor: '#ffffff',
}

const logoSection: React.CSSProperties = {
  textAlign: 'center',
  margin: '0 0 24px',
}

const logoImg: React.CSSProperties = {
  display: 'inline-block',
  maxWidth: '160px',
  height: 'auto',
  margin: '0 auto',
}

const heading: React.CSSProperties = {
  color: 'hsl(0 84% 45%)',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 24px',
  lineHeight: '1.3',
}

const paragraph: React.CSSProperties = {
  fontSize: '16px',
  color: 'hsl(220 9% 46%)',
  margin: '0 0 24px',
}

const codeSection: React.CSSProperties = {
  textAlign: 'center',
  margin: '32px 0',
}

const codeLabel: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  color: 'hsl(220 9% 46%)',
  margin: '0 0 8px',
}

const codeBox: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '36px',
  fontWeight: '700',
  letterSpacing: '8px',
  color: 'hsl(0 84% 45%)',
  backgroundColor: 'hsl(230 75% 95%)',
  border: '2px dashed hsl(230 75% 35%)',
  borderRadius: '8px',
  padding: '20px 32px',
  margin: 0,
}

const note: React.CSSProperties = {
  fontSize: '14px',
  color: 'hsl(220 9% 46%)',
  textAlign: 'center',
  margin: '24px 0 0',
}

const buttonSection: React.CSSProperties = {
  textAlign: 'center',
  margin: '32px 0',
}

const button: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: 'hsl(0 84% 45%)',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center',
  padding: '14px 28px',
  borderRadius: '8px',
}

const footer: React.CSSProperties = {
  fontSize: '12px',
  color: 'hsl(220 9% 46%)',
  textAlign: 'center',
  margin: '32px 0 0',
  borderTop: '1px solid hsl(220 13% 91%)',
  paddingTop: '24px',
}
