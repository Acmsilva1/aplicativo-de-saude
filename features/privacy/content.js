/** Textos LGPD mínimos exibidos no app (aviso + direitos + retenção). */

export const PRIVACY_TITLE = 'Privacidade e proteção de dados';

export const PRIVACY_SUMMARY = [
  'O Ritmo Saúde trata dados cadastrais e de saúde (dieta, hidratação e avaliações corporais) para prestar o serviço de acompanhamento nutricional no piloto.',
  'A biometria (digital/Face ID) fica no seu aparelho; no servidor guardamos apenas a credencial técnica WebAuthn, sem a imagem da digital.',
  'Base legal do piloto: execução de contrato/serviço solicitado e legítimo interesse em segurança do acesso. Dados sensíveis de saúde exigem cuidado reforçado.',
].join(' ');

export const PRIVACY_RIGHTS = [
  'Confirmar a existência de tratamento e acessar seus dados (exportação neste app).',
  'Corrigir dados incompletos ou desatualizados junto ao administrador ou professor responsável.',
  'Solicitar anonimização, bloqueio ou eliminação — inclusive pelo botão de exclusão da própria conta (não admin).',
  'Informação sobre compartilhamento: professor vinculado vê dieta, água e avaliações do aluno; administrador gerencia contas sem consultar saúde pela API.',
  'Revogar consentimento de comunicações e peticionar à ANPD, se aplicável.',
];

export const PRIVACY_RETENTION = [
  'Retenção do piloto: enquanto a conta estiver ativa e por até 30 dias após encerramento/exclusão para backup de contingência, salvo obrigação legal.',
  'Avaliações corporais e medidas são eliminadas com a exclusão da conta.',
  'Logs técnicos de segurança (ex.: tentativas de login) são agregados e efêmeros.',
].join(' ');

export const PRIVACY_CONTACT = 'Para exercer direitos ou esclarecimentos, use a exclusão/exportação neste app ou fale com o administrador do piloto.';
