import { useFocusEffect } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import { Check, CheckCircle2, FileText, MapPin, Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  getIdentityVerification,
  getProviderVerificationStatus,
  getQualificationVerification,
  type LocalVerificationFile,
  submitIdentityVerification,
  submitQualificationVerification,
  uploadQualificationFiles,
} from "../../api/provider";
import { LocationPickerModal } from "../../components/LocationPickerModal";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { getProviderTagLabel, PROVIDER_TAGS } from "../../constants/providerTags";
import { useAuth } from "../../context/AuthContext";
import { useProviderProfileGate } from "../../context/ProviderProfileGateContext";
import { colors, radius, spacing } from "../../theme/theme";
import type { SelectedLocation } from "../../types/location";
import type {
  IdentityVerificationApplication,
  ProviderVerificationStatus,
  QualificationVerificationApplication,
  VerificationStatus,
} from "../../types/provider";
import { getErrorMessage } from "../../utils/errors";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export function ProviderHomeScreen() {
  const { user } = useAuth();
  const { refreshProviderProfileStatus } = useProviderProfileGate();
  const [status, setStatus] = useState<ProviderVerificationStatus | null>(null);
  const [identity, setIdentity] = useState<IdentityVerificationApplication | null>(null);
  const [qualification, setQualification] = useState<QualificationVerificationApplication | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setMessage("");
    try {
      const nextStatus = await getProviderVerificationStatus();
      setStatus(nextStatus);
      if (!nextStatus) return;
      const [identityResult, qualificationResult] = await Promise.allSettled([
        nextStatus.identity_application_id ? getIdentityVerification() : Promise.resolve(null),
        nextStatus.qualification_application_id ? getQualificationVerification() : Promise.resolve(null),
      ]);
      setIdentity(identityResult.status === "fulfilled" ? identityResult.value : null);
      setQualification(qualificationResult.status === "fulfilled" ? qualificationResult.value : null);
      await refreshProviderProfileStatus();
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [refreshProviderProfileStatus]);

  useFocusEffect(useCallback(() => void load(), [load]));

  if (isLoading) return <ActivityIndicator color={colors.primary} style={styles.loader} />;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.title}>Provider verification</Text>
          <Text style={styles.subtitle}>Complete each step to unlock provider tools.</Text>
        </View>
        <SecondaryButton label="Refresh" onPress={() => void load()} />
      </View>
      <ProgressCard status={status} />
      {message ? <Text style={styles.error}>{message}</Text> : null}
      {status?.identity_status !== "approved" ? (
        <IdentityStep application={identity} firstName={user?.first_name || ""} lastName={user?.last_name || ""} onSubmitted={() => void load()} status={status?.identity_status ?? "not_submitted"} />
      ) : status.qualification_status !== "approved" ? (
        <QualificationStep application={qualification} onSubmitted={() => void load()} status={status.qualification_status} />
      ) : (
        <View style={styles.card}>
          <View style={styles.completeIcon}>
            <CheckCircle2 color={colors.primary} size={36} />
          </View>
          <Text style={styles.completeTitle}>Verification complete</Text>
          <Text style={styles.completeText}>
            Your provider tools are unlocked. Business details can now be
            updated from Account → Operating settings.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function ProgressCard({ status }: { status: ProviderVerificationStatus | null }) {
  const steps: Array<[string, VerificationStatus]> = [
    ["1. ID verification", status?.identity_status ?? "not_submitted"],
    ["2. Service verification", status?.qualification_status ?? "locked"],
  ];
  return (
    <View style={styles.stepper}>
      {steps.map(([label, value], index) => (
        <View key={label} style={styles.stepItem}>
          <View style={[styles.stepDot, value === "approved" ? styles.stepDotApproved : null]}>
            <Text style={[styles.stepNumber, value === "approved" ? styles.stepNumberApproved : null]}>
              {value === "approved" ? "✓" : index + 1}
            </Text>
          </View>
          <View style={styles.stepCopy}>
            <Text style={styles.progressLabel}>{label}</Text>
            <StatusBadge
              label={value === "locked" ? "Complete ID first" : undefined}
              status={value}
            />
          </View>
          {index === 0 ? <View style={styles.stepConnector} /> : null}
        </View>
      ))}
    </View>
  );
}

function IdentityStep({ application, firstName, lastName, onSubmitted, status }: {
  application: IdentityVerificationApplication | null; firstName: string; lastName: string; onSubmitted: () => void; status: VerificationStatus;
}) {
  const [dateOfBirth, setDateOfBirth] = useState(application?.date_of_birth ?? "");
  const [documentType, setDocumentType] = useState<"national_id" | "passport">(application?.document_type ?? "national_id");
  const [files, setFiles] = useState<LocalVerificationFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = status === "not_submitted" || status === "rejected";

  async function submit() {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Add your first and last name in Account → Edit profile before submitting.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || files.length === 0) {
      setError("Enter date of birth as YYYY-MM-DD and attach at least one file."); return;
    }
    setIsSubmitting(true); setError("");
    try {
      await submitIdentityVerification({ dateOfBirth, documentType, files });
      Alert.alert("Submitted", "Your identity application is now locked for review."); onSubmitted();
    } catch (submitError) { setError(getErrorMessage(submitError)); }
    finally { setIsSubmitting(false); }
  }

  return <View style={styles.card}>
    <View style={styles.cardHeader}><Text style={styles.cardTitle}>1. Identity verification</Text><StatusBadge status={status} /></View>
    {application?.review_note ? <Text style={styles.rejection}>Admin note: {application.review_note}</Text> : null}
    {!canSubmit ? <ApplicationSummary rows={[
      ["Name", `${application?.submitted_first_name ?? firstName} ${application?.submitted_last_name ?? lastName}`],
      ["Date of birth", application?.date_of_birth ?? "-"], ["Document", documentLabel(application?.document_type)],
      ["Files", String(application?.document_files.length ?? 0)],
    ]} note="The application cannot be changed or cancelled while pending. Approved identity details stay locked." /> :
      <View style={styles.form}>
        <ReadOnlyRow label="First name" value={firstName} /><ReadOnlyRow label="Last name" value={lastName} />
        <Text style={styles.hint}>These names are read from your account.</Text>
        {!firstName.trim() || !lastName.trim() ? <Text style={styles.error}>Complete both names in Account → Edit profile first.</Text> : null}
        <TextField label="Date of birth" onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" value={dateOfBirth} />
        <ChoiceRow options={[["national_id", "National ID"], ["passport", "Passport"]]} selected={documentType} onSelect={(value) => setDocumentType(value as "national_id" | "passport")} />
        <FilePicker files={files} onChange={setFiles} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton disabled={!firstName.trim() || !lastName.trim()} isLoading={isSubmitting} label="Submit identity verification" onPress={() => void submit()} />
      </View>}
  </View>;
}

function QualificationStep({ application, onSubmitted, status }: { application: QualificationVerificationApplication | null; onSubmitted: () => void; status: VerificationStatus }) {
  const [entityType, setEntityType] = useState<"personal" | "organisation">(application?.entity_type ?? "personal");
  const [legalName, setLegalName] = useState(application?.legal_name ?? "");
  const [enterpriseId, setEnterpriseId] = useState(application?.unique_enterprise_id ?? "");
  const [description, setDescription] = useState(application?.description ?? "");
  const [phone, setPhone] = useState(application?.contact_phone ?? "");
  const [address, setAddress] = useState<SelectedLocation | null>(application ? {
    label: application.business_address,
    latitude: application.business_latitude,
    longitude: application.business_longitude,
    placeId: application.business_place_id,
  } : null);
  const [categories, setCategories] = useState<string[]>(application?.service_categories ?? []);
  const [files, setFiles] = useState<LocalVerificationFile[]>([]);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = status === "not_submitted" || status === "rejected";

  async function submit() {
    if (!description.trim() || !phone.trim() || !address || categories.length === 0 || files.length === 0 || (entityType === "organisation" && (!legalName.trim() || !enterpriseId.trim()))) {
      setError("Complete every required field and attach at least one file."); return;
    }
    setIsSubmitting(true); setError("");
    try {
      const uploaded = await uploadQualificationFiles(files);
      if (!uploaded) throw new Error("The qualification files could not be uploaded.");
      await submitQualificationVerification({
        entity_type: entityType,
        legal_name: entityType === "organisation" ? legalName.trim() : null,
        unique_enterprise_id: entityType === "organisation" ? enterpriseId.trim() : null,
        description: description.trim(), contact_phone: phone.trim(), business_address: address.label,
        business_place_id: address.placeId, business_latitude: address.latitude, business_longitude: address.longitude,
        service_categories: categories, qualification_files: uploaded.files,
      });
      Alert.alert("Submitted", "Your service verification application is now locked for review."); onSubmitted();
    } catch (submitError) { setError(getErrorMessage(submitError)); }
    finally { setIsSubmitting(false); }
  }

  return <View style={styles.card}>
    <View style={styles.cardHeader}><Text style={styles.cardTitle}>2. Service verification</Text><StatusBadge status={status} /></View>
    {application?.review_note ? <Text style={styles.rejection}>Admin note: {application.review_note}</Text> : null}
    {!canSubmit ? <ApplicationSummary rows={[
      ["Provider type", application?.entity_type ?? "-"], ["Display name", application?.display_name ?? "-"],
      ["Business address", application?.business_address ?? "-"], ["Services", application?.service_categories.map(getProviderTagLabel).join(", ") ?? "-"],
      ["Files", String(application?.qualification_files.length ?? 0)],
    ]} note="The application cannot be changed or cancelled while pending." /> :
      <View style={styles.form}>
        <Text style={styles.fieldLabel}>Provider type</Text>
        <ChoiceRow options={[["personal", "Personal"], ["organisation", "Organisation"]]} selected={entityType} onSelect={(value) => setEntityType(value as "personal" | "organisation")} />
        {entityType === "organisation" ? <><TextField label="Legal organisation name" onChangeText={setLegalName} value={legalName} /><TextField label="Unique enterprise ID" onChangeText={setEnterpriseId} value={enterpriseId} /></> : <Text style={styles.hint}>Your approved account name becomes the display name.</Text>}
        <TextField label="Business description" multiline onChangeText={setDescription} value={description} />
        <TextField label="Contact phone" keyboardType="phone-pad" onChangeText={setPhone} value={phone} />
        <AddressButton location={address} onPress={() => setShowAddressPicker(true)} />
        <Text style={styles.fieldLabel}>Services to verify</Text>
        <TagPicker selected={categories} onChange={setCategories} options={[...PROVIDER_TAGS]} />
        <FilePicker files={files} onChange={setFiles} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton isLoading={isSubmitting} label="Submit service verification" onPress={() => void submit()} />
        <LocationPickerModal onClose={() => setShowAddressPicker(false)} onConfirm={(location) => { setAddress(location); setShowAddressPicker(false); }} value={address} visible={showAddressPicker} />
      </View>}
  </View>;
}

function FilePicker({ files, onChange }: { files: LocalVerificationFile[]; onChange: (files: LocalVerificationFile[]) => void }) {
  const [error, setError] = useState("");
  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true, type: ["application/pdf", "image/png", "image/jpeg"] });
    if (result.canceled) return;
    if (files.length + result.assets.length > MAX_FILES) { setError("You can attach at most 5 files."); return; }
    const invalid = result.assets.find((asset) => (asset.size != null && asset.size > MAX_FILE_SIZE) || (asset.mimeType != null && !ACCEPTED_TYPES.includes(asset.mimeType)));
    if (invalid) { setError("Files must be PDF, PNG, JPG/JPEG and no larger than 5 MB each."); return; }
    setError("");
    onChange([...files, ...result.assets.map((asset) => ({ uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType || "application/octet-stream" }))]);
  }
  return <View style={styles.form}><Text style={styles.fieldLabel}>Verification files (1–5)</Text><Text style={styles.hint}>PDF, PNG or JPG/JPEG. Maximum 5 MB per file.</Text>
    {files.map((file, index) => <View key={`${file.uri}-${index}`} style={styles.fileRow}><FileText color={colors.primary} size={18} /><Text numberOfLines={1} style={styles.flex}>{file.fileName}</Text><Pressable onPress={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}><Trash2 color={colors.danger} size={18} /></Pressable></View>)}
    <SecondaryButton disabled={files.length >= MAX_FILES} label="Add files" onPress={() => void pick()} />{error ? <Text style={styles.error}>{error}</Text> : null}</View>;
}

function TagPicker({ selected, onChange, options }: { selected: string[]; onChange: (values: string[]) => void; options: string[] }) {
  return <View style={styles.tags}>{options.map((tag) => { const active = selected.includes(tag); return <Pressable key={tag} onPress={() => onChange(active ? selected.filter((item) => item !== tag) : [...selected, tag])} style={[styles.tag, active ? styles.tagActive : null]}>{active ? <Check color={colors.primary} size={14} /> : null}<Text style={[styles.tagText, active ? styles.tagTextActive : null]}>{getProviderTagLabel(tag)}</Text></Pressable>; })}</View>;
}

function ChoiceRow({ options, selected, onSelect }: { options: Array<[string, string]>; selected: string; onSelect: (value: string) => void }) {
  return <View style={styles.tags}>{options.map(([value, label]) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.tag, selected === value ? styles.tagActive : null]}><Text style={[styles.tagText, selected === value ? styles.tagTextActive : null]}>{label}</Text></Pressable>)}</View>;
}

function AddressButton({ location, onPress }: { location: SelectedLocation | null; onPress: () => void }) {
  return <View style={styles.form}><Text style={styles.fieldLabel}>Business address</Text><Pressable onPress={onPress} style={styles.addressButton}><MapPin color={colors.primary} size={20} /><Text style={styles.flex}>{location?.label || "Select the exact business address"}</Text></Pressable></View>;
}

function ApplicationSummary({ rows, note }: { rows: Array<[string, string]>; note: string }) {
  return <View style={styles.form}>{rows.map(([label, value]) => <ReadOnlyRow key={label} label={label} value={value} />)}<Text style={styles.hint}>{note}</Text></View>;
}
function ReadOnlyRow({ label, value }: { label: string; value: string }) { return <View style={styles.readOnlyRow}><Text style={styles.muted}>{label}</Text><Text style={styles.readOnlyValue}>{value || "-"}</Text></View>; }
function StatusBadge({ status, label }: { status: VerificationStatus; label?: string }) { return <Text style={[styles.badge, status === "approved" ? styles.badgeApproved : status === "rejected" ? styles.badgeRejected : null]}>{label ?? status.replace("_", " ")}</Text>; }
function documentLabel(value?: string) { return value === "passport" ? "Passport" : value === "national_id" ? "National ID" : "-"; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface }, content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: spacing.lg, gap: spacing.md }, loader: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }, title: { color: colors.text, fontSize: 26, fontWeight: "800" }, subtitle: { color: colors.mutedText, marginTop: spacing.xs },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md }, cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }, cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  stepper: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg }, stepItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, position: "relative" }, stepDot: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, stepDotApproved: { borderColor: colors.primary, backgroundColor: "#E9F7F3" }, stepNumber: { color: colors.mutedText, fontWeight: "800" }, stepNumberApproved: { color: colors.primary }, stepCopy: { flex: 1, alignItems: "flex-start", gap: spacing.xs }, stepConnector: { position: "absolute", right: -spacing.lg, width: spacing.lg, height: 1, backgroundColor: colors.border }, progressLabel: { color: colors.text, fontWeight: "700" },
  badge: { overflow: "hidden", borderRadius: 999, backgroundColor: "#FFF4D6", color: "#8A5A00", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontSize: 12, fontWeight: "700", textTransform: "capitalize" }, badgeApproved: { backgroundColor: "#E9F7F3", color: colors.primary }, badgeRejected: { backgroundColor: "#FDECEC", color: colors.danger },
  form: { gap: spacing.md }, fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "600" }, hint: { color: colors.mutedText, fontSize: 13, lineHeight: 19 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 }, rejection: { borderRadius: radius.sm, backgroundColor: "#FDECEC", color: colors.danger, padding: spacing.md },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, tag: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md }, tagActive: { borderColor: colors.primary, backgroundColor: "#E9F7F3" }, tagText: { color: colors.text, fontWeight: "600" }, tagTextActive: { color: colors.primary },
  fileRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md }, addressButton: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  readOnlyRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm }, readOnlyValue: { flex: 1, color: colors.text, fontWeight: "600", textAlign: "right" }, muted: { color: colors.mutedText }, link: { color: colors.primary, fontWeight: "700" }, flex: { flex: 1, color: colors.text }, completeIcon: { alignSelf: "center", width: 68, height: 68, alignItems: "center", justifyContent: "center", borderRadius: 34, backgroundColor: "#E9F7F3" }, completeTitle: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "center" }, completeText: { color: colors.mutedText, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
