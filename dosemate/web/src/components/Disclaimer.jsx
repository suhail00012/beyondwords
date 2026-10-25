import { useI18n } from "../i18n-context.jsx";

export default function Disclaimer() {
  const { t } = useI18n();
  return <div className="disclaimer sticky">⚠ {t("disclaimer")}</div>;
}
