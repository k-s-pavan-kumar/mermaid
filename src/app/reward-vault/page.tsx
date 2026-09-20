import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getSettings } from '@/features/settings/queries';
import { reconcileNeeds, getAuditLog } from '@/features/reward-vault/queries';
import { getLinkOptions } from '@/features/reward-vault/actions';
import { RewardVaultClient } from '@/features/reward-vault/components/RewardVaultClient';
import { Shell } from '@/components/Shell';

export default async function RewardVaultPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const settings = await getSettings(email);
  const needs = await reconcileNeeds(email, settings.reward_vault.cooldown_hours, settings.reward_vault.expiry_days);
  const [options, auditLog] = await Promise.all([getLinkOptions(email), getAuditLog(email)]);

  return (
    <Shell active="reward-vault" title="Reward Vault" crumb="Personal">
      <p className="text-muted" style={{ marginTop: -8, marginBottom: 18, maxWidth: 560 }}>
        Rewards for things you&apos;ve actually finished and been paid for — never a wishlist
        you can just buy from. Finish the project, get paid, wait out the cooldown.
      </p>
      <RewardVaultClient
        needs={needs}
        currency={settings.targets.currency}
        options={options}
        auditLog={auditLog}
      />
    </Shell>
  );
}
