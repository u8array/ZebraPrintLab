import { useLabelStore } from '../store/labelStore';
import { loadFetchedDataset, currentDataContext } from '../store/datasetActions';
import { dbFetchDataset, awaitCredWrites } from '../lib/db';
import { formatTemplate } from '../lib/formatTemplate';
import { useT } from './useT';
import type { DbProfile } from '../lib/db';

/** Fetch-and-load flow shared by the connect modal and the reconnect chip. */
export function useDbConnectActions() {
  const t = useT();

  const loadFromDb = async (profile: DbProfile, table: string): Promise<boolean> => {
    // Sample BEFORE awaitCredWrites: a document loaded while a password write is
    // pending must supersede this fetch, not be seen as the current context.
    const token = currentDataContext();
    try {
      // Any pending password write (from the settings tab) must land before we
      // connect, or the Rust keychain read could see the old/absent secret.
      await awaitCredWrites();
      // Returns false if a newer dataset op superseded this fetch mid-flight,
      // so the caller (settings tab) doesn't close as if it had loaded.
      return await loadFetchedDataset(() => dbFetchDataset(profile, table), token);
    } catch (e) {
      useLabelStore
        .getState()
        .setUserError(formatTemplate(t.variables.dbFetchErrorFmt, { error: String(e) }));
      return false;
    }
  };

  /** One-click re-fetch for a design-file db link; falls back to the
   *  data-sources settings tab when the referenced profile no longer exists
   *  on this machine. */
  const reconnect = () => {
    const { dataSourceRef, dbProfiles, setPrinterSettingsTab, setUserError } =
      useLabelStore.getState();
    if (!dataSourceRef) return;
    const profile = dbProfiles.find((p) => p.id === dataSourceRef.profileId);
    if (!profile) {
      setUserError(t.variables.dbReconnectMissingProfile);
      setPrinterSettingsTab('dataSources');
      return;
    }
    void loadFromDb(profile, dataSourceRef.table);
  };

  return { loadFromDb, reconnect };
}
