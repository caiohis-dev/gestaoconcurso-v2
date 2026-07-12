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

interface DataUpdateEmailProps {
  name?: string
  siteName?: string
  siteUrl?: string
  logoUrl?: string
  deadline?: string
}

const Email = ({ name, siteName, siteUrl, logoUrl, deadline }: DataUpdateEmailProps) => {
  const displayName = name || 'Colaborador'
  const displaySite = siteName || 'FEVRE'
  const displayLogo = logoUrl || 'https://fevre.online/fevre-logo.png'
  const displayDeadline = deadline || 'o prazo informado'

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head>
        <style>
          {`
            @media only screen and (max-width: 600px) {
              .container { padding: 24px 16px !important; }
            }
          `}
        </style>
      </Head>
      <Preview>Atualize seus dados cadastrais no {displaySite}</Preview>
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
            Solicitamos que você atualize seus dados cadastrais no sistema do <strong>{displaySite}</strong>.
            Mantenha seu cadastro atualizado para garantir o acesso às provas e recebimento de informações importantes.
          </Text>

          <Section style={highlightSection}>
            <Text style={highlightText}>
              Por favor, acesse o sistema e revise seus dados pessoais até <strong>{displayDeadline}</strong>.
            </Text>
          </Section>

          {siteUrl && (
            <Section style={buttonSection}>
              <Button href={siteUrl} style={button}>
                Atualizar meus dados
              </Button>
            </Section>
          )}

          <Text style={note}>
            Caso já tenha atualizado seus dados recentemente, desconsidere este e-mail.
          </Text>

          <Text style={footer}>
            Em caso de dúvidas, entre em contato com o Coordenador da sua unidade.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Atualize seus dados cadastrais — FEVRE',
  displayName: 'Atualização de Dados',
  previewData: {
    name: 'Maria Silva',
    siteName: 'FEVRE',
    siteUrl: 'https://fevre.online/auth',
    logoUrl: 'https://fevre.online/fevre-logo.png',
    deadline: '15/07/2026',
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

const highlightSection: React.CSSProperties = {
  backgroundColor: 'hsl(230 75% 95%)',
  border: '1px solid hsl(230 75% 85%)',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '24px 0',
  textAlign: 'center',
}

const highlightText: React.CSSProperties = {
  fontSize: '15px',
  color: 'hsl(230 75% 25%)',
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
