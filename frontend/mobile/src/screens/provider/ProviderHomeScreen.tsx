import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  UserRound,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createProviderProfile,
  getProviderPortfolios,
  getProviderProfile,
  getProviderReviews,
  uploadProviderCertificates,
  updateProviderProfile,
} from "../../api/provider";
import { PortfolioCard } from "../../components/PortfolioCard";
import { PrimaryButton } from "../../components/PrimaryButton";
import { LocationCascadePickerModal } from "../../components/LocationCascadePickerModal";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import {
  getProviderTagLabel,
  PROVIDER_TAGS,
} from "../../constants/providerTags";
import { useAuth } from "../../context/AuthContext";
import { useProviderProfileGate } from "../../context/ProviderProfileGateContext";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radius, spacing } from "../../theme/theme";
import {
  describeStatus,
  describeStepAction,
  getIdentityStatus,
  getQualificationStepState,
  type StepState,
} from "../../utils/providerVerification";
import type { PaginatedData } from "../../types/chat";
import type {
  ProviderPortfolio,
  ProviderProfile,
  ProviderProfilePayload,
} from "../../types/provider";
import type { Review } from "../../types/review";
import type { ServiceAreaSelection } from "../../types/location";
import { getErrorMessage } from "../../utils/errors";
import { resolveMediaUrl } from "../../utils/media";

const REVIEW_PAGE_SIZE = 10;
const DEFAULT_SERVICE_PROVINCE = "Istanbul";
const DEFAULT_LATITUDE = 41.0082;
const DEFAULT_LONGITUDE = 28.9784;

type SelectedProviderCertificateFile = {
  uri: string;
  fileName: string;
  mimeType: string;
  fileUrl?: string;
};

export function ProviderHomeScreen() {
  const { user } = useAuth();
  const { refreshProviderProfileStatus } = useProviderProfileGate();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [portfolios, setPortfolios] = useState<ProviderPortfolio[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPaging, setReviewPaging] =
    useState<PaginatedData<Review> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isProfileMissing, setIsProfileMissing] = useState(false);

  const loadHome = useCallback(
    async (isActive = true) => {
      setIsLoading(true);
      setMessage("");

      try {
        const nextProfile = await getProviderProfile();

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);
        setIsProfileMissing(false);

        // WS-105: a filled-in form no longer unlocks anything; only an
        // approved qualification does. Re-reading the status instead of only
        // marking it created means an approval that was revoked locks again
        // without waiting for a remount.
        void refreshProviderProfileStatus();
      } catch (error) {
        if (isActive) {
          const status = (error as { response?: { status?: number } }).response
            ?.status;
          setProfile(null);
          setIsProfileMissing(status === 404);
          setMessage(status === 404 ? "" : getErrorMessage(error));
          setIsLoading(false);
        }

        return;
      }

      // WS-104 answers 403 for portfolios until the qualification is approved.
      // Reviews are not gated the same way, so the two are fetched separately:
      // one refusal must not empty the other list.
      const [portfolioResult, reviewResult] = await Promise.allSettled([
        getProviderPortfolios(1, 4),
        getProviderReviews(1, REVIEW_PAGE_SIZE),
      ]);

      if (!isActive) {
        return;
      }

      if (portfolioResult.status === "fulfilled") {
        setPortfolios(portfolioResult.value?.items ?? []);
      } else {
        setPortfolios([]);
      }

      if (reviewResult.status === "fulfilled") {
        setReviews(reviewResult.value?.items ?? []);
        setReviewPaging(reviewResult.value ?? null);
        setReviewPage(1);
      } else {
        setReviews([]);
        setReviewPaging(null);
        setReviewPage(1);
      }

      // A 403 before approval is expected; anything else is worth showing.
      const unexpected = [portfolioResult, reviewResult].find(
        (result) =>
          result.status === "rejected" &&
          (result.reason as { response?: { status?: number } })?.response
            ?.status !== 403,
      );
      setMessage(
        unexpected && unexpected.status === "rejected"
          ? getErrorMessage(unexpected.reason)
          : "",
      );
      setIsLoading(false);
    },
    [refreshProviderProfileStatus],
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void loadHome(isActive);

      return () => {
        isActive = false;
      };
    }, [loadHome]),
  );

  async function loadMoreReviews() {
    if (isLoadingMore || !reviewPaging?.has_next) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const nextPage = reviewPage + 1;
      const nextData = await getProviderReviews(nextPage, REVIEW_PAGE_SIZE);

      if (nextData) {
        setReviews((current) => [...current, ...nextData.items]);
        setReviewPaging(nextData);
        setReviewPage(nextPage);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }

  const avatarUrl = resolveMediaUrl(user?.avatar_url ?? null);

  if (!isLoading && (isProfileMissing || isEditingProfile)) {
    return (
      <ProviderProfileForm
        initialProfile={profile}
        onCancel={profile ? () => setIsEditingProfile(false) : undefined}
        onSaved={(nextProfile) => {
          void refreshProviderProfileStatus();
          setProfile(nextProfile);
          setIsEditingProfile(false);
          void loadHome();
        }}
      />
    );
  }

  return (
    <FlatList
      ListEmptyComponent={
        isLoading ? null : (
          <Text style={styles.emptyText}>{message || "No reviews yet"}</Text>
        )
      }
      ListFooterComponent={
        isLoadingMore ? (
          <ActivityIndicator
            color={colors.primary}
            style={styles.footerLoader}
          />
        ) : null
      }
      ListHeaderComponent={
        <View style={styles.headerContent}>
          <View style={styles.profileRow}>
            <View style={styles.avatarBox}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <UserRound color={colors.mutedText} size={34} />
              )}
            </View>
            <View style={styles.profileTextBox}>
              <Text numberOfLines={1} style={styles.nameText}>
                {user?.name ?? "Provider"}
              </Text>
              <Text numberOfLines={1} style={styles.businessText}>
                {profile?.business_name ?? "Provider"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsEditingProfile(true)}
              style={styles.editButton}
            >
              <Edit3 color={colors.primary} size={18} />
            </Pressable>
          </View>

          <VerificationCard
            note={profile?.verification_note ?? null}
            onOpenForm={() => setIsEditingProfile(true)}
            profile={profile}
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Portfolios</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate("ProviderPortfolioList")}
              style={styles.moreButton}
            >
              <Text style={styles.moreText}>See all</Text>
              <ChevronRight color={colors.primary} size={18} />
            </Pressable>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : portfolios.length > 0 ? (
            <FlatList
              ItemSeparatorComponent={() => (
                <View style={styles.portfolioGap} />
              )}
              data={portfolios}
              horizontal
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <PortfolioCard
                  compact
                  onPress={() =>
                    navigation.navigate("ProviderPortfolioDetail", {
                      portfolioId: item.id,
                    })
                  }
                  portfolio={item}
                />
              )}
              showsHorizontalScrollIndicator={false}
            />
          ) : (
            <Text style={styles.emptyText}>No portfolios uploaded yet</Text>
          )}

          <Text style={styles.sectionTitle}>Reviews</Text>
        </View>
      }
      contentContainerStyle={styles.content}
      data={reviews}
      keyExtractor={(item) => String(item.id)}
      onEndReached={() => void loadMoreReviews()}
      onEndReachedThreshold={0.4}
      renderItem={({ item }) => <ReviewRow review={item} />}
      style={styles.container}
    />
  );
}

function ProviderProfileForm({
  initialProfile,
  onSaved,
  onCancel,
}: {
  initialProfile: ProviderProfile | null;
  onSaved: (profile: ProviderProfile) => void;
  onCancel?: () => void;
}) {
  const [businessName, setBusinessName] = useState(
    initialProfile?.business_name ?? "",
  );
  const [bio, setBio] = useState(initialProfile?.bio ?? "");
  const [phoneNumber, setPhoneNumber] = useState(
    initialProfile?.phone_number ?? "",
  );
  const [address, setAddress] = useState(initialProfile?.address ?? "");
  const [serviceProvince, setServiceProvince] = useState(
    initialProfile?.service_province || DEFAULT_SERVICE_PROVINCE,
  );
  const [serviceLocationId, setServiceLocationId] = useState<number | null>(
    initialProfile?.service_location_id ?? null,
  );
  const [serviceAreaLabel, setServiceAreaLabel] = useState(
    initialProfile?.service_province || DEFAULT_SERVICE_PROVINCE,
  );
  const [tags, setTags] = useState<string[]>(initialProfile?.tags ?? []);
  const [hourlyRate, setHourlyRate] = useState(
    initialProfile?.hourly_rate ? String(initialProfile.hourly_rate) : "",
  );
  const [experienceYears, setExperienceYears] = useState(
    initialProfile?.experience_years != null
      ? String(initialProfile.experience_years)
      : "",
  );
  const [certificateName, setCertificateName] = useState(
    initialProfile?.certificate_name ?? "",
  );
  const [certificateUrl, setCertificateUrl] = useState(
    initialProfile?.certificate_url ?? "",
  );
  const [certificateFiles, setCertificateFiles] = useState<
    SelectedProviderCertificateFile[]
  >(() => {
    if (initialProfile?.certificate_files?.length) {
      return initialProfile.certificate_files.map((certificate) => ({
        uri: certificate.file_url,
        fileName: certificate.original_file_name,
        mimeType: certificate.content_type,
        fileUrl: certificate.file_url,
      }));
    }

    if (initialProfile?.certificate_url) {
      return [
        {
          uri: initialProfile.certificate_url,
          fileName: initialProfile.certificate_name,
          mimeType: "application/octet-stream",
          fileUrl: initialProfile.certificate_url,
        },
      ];
    }

    return [];
  });
  const [serviceRadiusKm, setServiceRadiusKm] = useState(
    initialProfile?.service_radius_km
      ? String(initialProfile.service_radius_km)
      : "10",
  );
  const [notes, setNotes] = useState(initialProfile?.notes ?? "");
  const [isProvincePickerVisible, setIsProvincePickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  function toggleTag(tag: string) {
    setTags((currentTags) =>
      currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag],
    );
  }

  async function pickCertificateMedia() {
    setMessage("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Allow access to photos to add certificates.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      allowsMultipleSelection: true,
      mediaTypes: ["images", "videos"],
      quality: 0.85,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const selectedFiles: SelectedProviderCertificateFile[] = [];
    for (const asset of result.assets) {
      const fileName =
        asset.fileName || getDefaultCertificateFileName(asset.mimeType);
      if (!isAllowedCertificateFile(fileName, asset.mimeType)) {
        setMessage("Certificates must be JPG, MP4, or PDF.");
        return;
      }

      selectedFiles.push({
        uri: asset.uri,
        fileName,
        mimeType: getCertificateMimeType(fileName, asset.mimeType),
      });
    }

    setCertificateFiles((currentFiles) => [...currentFiles, ...selectedFiles]);
    if (!certificateName.trim() && selectedFiles[0]) {
      setCertificateName(selectedFiles[0].fileName);
    }
  }

  async function pickCertificatePdf() {
    setMessage("");
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: "application/pdf",
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const selectedFiles: SelectedProviderCertificateFile[] = [];
    for (const asset of result.assets) {
      if (!isAllowedCertificateFile(asset.name, asset.mimeType)) {
        setMessage("Certificates must be JPG, MP4, or PDF.");
        return;
      }

      selectedFiles.push({
        uri: asset.uri,
        fileName: asset.name,
        mimeType: "application/pdf",
      });
    }

    setCertificateFiles((currentFiles) => [...currentFiles, ...selectedFiles]);
    if (!certificateName.trim() && selectedFiles[0]) {
      setCertificateName(selectedFiles[0].fileName);
    }
  }

  function removeCertificateFile(index: number) {
    setCertificateFiles((currentFiles) => {
      const nextFiles = currentFiles.filter(
        (_, fileIndex) => fileIndex !== index,
      );
      if (!nextFiles.some((file) => file.fileUrl)) {
        setCertificateUrl("");
      }
      return nextFiles;
    });
  }

  async function handleSubmit() {
    const parsedHourlyRate = Number(hourlyRate);
    const parsedExperienceYears = Number(experienceYears);
    const parsedServiceRadiusKm = Number(serviceRadiusKm);

    if (
      !businessName.trim() ||
      !bio.trim() ||
      !phoneNumber.trim() ||
      !address.trim() ||
      !serviceLocationId ||
      !certificateName.trim() ||
      (!certificateUrl.trim() && certificateFiles.length === 0) ||
      tags.length === 0
    ) {
      setMessage(
        "Fill in the required fields and choose at least one service.",
      );
      return;
    }

    if (
      !Number.isFinite(parsedHourlyRate) ||
      parsedHourlyRate <= 0 ||
      !Number.isInteger(parsedExperienceYears) ||
      parsedExperienceYears < 0 ||
      !Number.isFinite(parsedServiceRadiusKm) ||
      parsedServiceRadiusKm <= 0
    ) {
      setMessage(
        "Enter a valid hourly rate, years of experience, and service radius.",
      );
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const existingCertificateFiles = certificateFiles.filter(
        (certificateFile) => Boolean(certificateFile.fileUrl),
      );
      const newCertificateFiles = certificateFiles.filter(
        (certificateFile) => !certificateFile.fileUrl,
      );
      const certificateFileInputs = existingCertificateFiles.map(
        (certificateFile, index) => ({
          file_url: certificateFile.fileUrl as string,
          original_file_name: certificateFile.fileName,
          content_type: certificateFile.mimeType,
          media_type: getCertificateMediaType(certificateFile.mimeType),
          sort_order: index,
        }),
      );

      if (newCertificateFiles.length > 0) {
        const uploadResult =
          await uploadProviderCertificates(newCertificateFiles);
        if (!uploadResult?.files?.length) {
          throw new Error("Certificate upload failed. Try again.");
        }
        certificateFileInputs.push(
          ...uploadResult.files.map((certificateFile, index) => ({
            file_url: certificateFile.file_url,
            original_file_name: certificateFile.original_file_name,
            content_type: certificateFile.content_type,
            media_type: certificateFile.media_type,
            sort_order: certificateFileInputs.length + index,
          })),
        );
      }

      const firstCertificateFile = certificateFileInputs[0];
      const nextCertificateUrl =
        firstCertificateFile?.file_url || certificateUrl.trim();
      if (!nextCertificateUrl) {
        throw new Error("Add at least one certificate.");
      }

      const payload: ProviderProfilePayload = {
        business_name: businessName.trim(),
        bio: bio.trim(),
        phone_number: phoneNumber.trim(),
        address: address.trim(),
        service_province: serviceProvince,
        service_location_id: serviceLocationId,
        latitude: initialProfile?.latitude ?? DEFAULT_LATITUDE,
        longitude: initialProfile?.longitude ?? DEFAULT_LONGITUDE,
        service_radius_km: parsedServiceRadiusKm,
        tags,
        certificate_name: certificateName.trim(),
        certificate_url: nextCertificateUrl,
        certificate_files: certificateFileInputs,
        hourly_rate: parsedHourlyRate,
        experience_years: parsedExperienceYears,
        notes: notes.trim() || null,
      };

      const result = initialProfile
        ? await updateProviderProfile(payload)
        : await createProviderProfile(payload);

      if (result?.profile) {
        onSaved(result.profile);
      }

      Alert.alert("Submitted", "Your profile is now under review.");
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.formContent}
      style={styles.container}
    >
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>
          {initialProfile ? "Edit provider profile" : "Create provider profile"}
        </Text>
        <Text style={styles.formSubtitle}>
          Submissions go to admin review. You can display and accept bookings
          after approval.
        </Text>
      </View>

      <View style={styles.formCard}>
        <TextField
          label="Business name"
          onChangeText={setBusinessName}
          placeholder="e.g. Istanbul CleanCare"
          value={businessName}
        />
        <TextField
          label="Business bio"
          multiline
          numberOfLines={4}
          onChangeText={setBio}
          placeholder="Describe your services and experience"
          value={bio}
        />
        <TextField
          keyboardType="phone-pad"
          label="Phone number"
          onChangeText={setPhoneNumber}
          placeholder="Phone number"
          value={phoneNumber}
        />
        <TextField
          label="Address"
          onChangeText={setAddress}
          placeholder="Business address"
          value={address}
        />

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Service area</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsProvincePickerVisible(true)}
            style={styles.provinceButton}
          >
            <Text style={styles.provinceText}>{serviceAreaLabel}</Text>
            <ChevronDown color={colors.mutedText} size={20} />
          </Pressable>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Service tags</Text>
          <View style={styles.tagGrid}>
            {PROVIDER_TAGS.map((tag) => {
              const isSelected = tags.includes(tag);

              return (
                <Pressable
                  accessibilityRole="button"
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  style={[
                    styles.tagChip,
                    isSelected ? styles.tagChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.tagText,
                      isSelected ? styles.tagTextActive : null,
                    ]}
                  >
                    {getProviderTagLabel(tag)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.twoColumnRow}>
          <View style={styles.twoColumnItem}>
            <TextField
              keyboardType="numeric"
              label="Hourly rate"
              onChangeText={setHourlyRate}
              placeholder="e.g. 120"
              value={hourlyRate}
            />
          </View>
          <View style={styles.twoColumnItem}>
            <TextField
              keyboardType="numeric"
              label="Years of experience"
              onChangeText={setExperienceYears}
              placeholder="e.g. 3"
              value={experienceYears}
            />
          </View>
        </View>

        <TextField
          keyboardType="numeric"
          label="Service radius (km)"
          onChangeText={setServiceRadiusKm}
          placeholder="e.g. 10"
          value={serviceRadiusKm}
        />
        <TextField
          label="Certificate name"
          onChangeText={setCertificateName}
          placeholder="e.g. Business license"
          value={certificateName}
        />
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Certificate files</Text>
          <Text style={styles.fileHint}>
            Only JPG, MP4, and PDF files are supported. Files upload
            automatically on submission.
          </Text>
          <View style={styles.fileActions}>
            <SecondaryButton
              disabled={isSaving}
              label="Add photo or video"
              onPress={() => void pickCertificateMedia()}
            />
            <SecondaryButton
              disabled={isSaving}
              label="Add PDF"
              onPress={() => void pickCertificatePdf()}
            />
          </View>
          {certificateFiles.length > 0 ? (
            <View style={styles.selectedFilesList}>
              {certificateFiles.map((certificateFile, index) => (
                <View
                  key={`${certificateFile.uri}-${index}`}
                  style={styles.selectedFileRow}
                >
                  <Text numberOfLines={1} style={styles.selectedFileText}>
                    {certificateFile.fileUrl
                      ? "Uploaded: "
                      : "Pending upload: "}
                    {certificateFile.fileName}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={() => removeCertificateFile(index)}
                  >
                    <Text style={styles.removeFileText}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : certificateUrl ? (
            <Text numberOfLines={1} style={styles.selectedFileText}>
              Current file: {getCertificateDisplayName(certificateUrl)}
            </Text>
          ) : (
            <Text style={styles.fileHint}>No certificate file selected</Text>
          )}
        </View>
        <TextField
          label="Notes"
          multiline
          numberOfLines={3}
          onChangeText={setNotes}
          placeholder="Optional"
          value={notes}
        />

        <View style={styles.locationHint}>
          <Text style={styles.locationHintText}>
            Service district: {serviceAreaLabel}
          </Text>
        </View>

        {message ? <Text style={styles.formMessage}>{message}</Text> : null}

        <View style={styles.formActions}>
          {onCancel ? (
            <SecondaryButton
              disabled={isSaving}
              label="Cancel"
              onPress={onCancel}
            />
          ) : null}
          <PrimaryButton
            disabled={isSaving}
            isLoading={isSaving}
            label="Submit for review"
            onPress={() => void handleSubmit()}
          />
        </View>
      </View>

      <LocationCascadePickerModal
        onClose={() => setIsProvincePickerVisible(false)}
        onSelect={(selection) => {
          setServiceProvince(selection.serviceProvince);
          setServiceLocationId(selection.serviceLocationId);
          setServiceAreaLabel(selection.label);
          setIsProvincePickerVisible(false);
        }}
        value={
          serviceLocationId
            ? ({
                serviceLocationId,
                serviceProvince,
                label: serviceAreaLabel,
              } satisfies ServiceAreaSelection)
            : null
        }
        visible={isProvincePickerVisible}
      />
    </ScrollView>
  );
}

/**
 * WS-105. Two independent steps, in order: identity, then qualification.
 * Everything else stays locked until an admin approves the qualification.
 */
function VerificationCard({
  note,
  onOpenForm,
  profile,
}: {
  note: string | null;
  onOpenForm: () => void;
  profile: ProviderProfile | null;
}) {
  const identity = getIdentityStatus(profile);
  const qualification = getQualificationStepState(profile);
  const unlocked = qualification === "approved";

  return (
    <View style={styles.verificationCard}>
      <View style={styles.verificationHeader}>
        <Text style={styles.statusTitle}>Verification</Text>
        <Text style={styles.verificationHint}>
          {unlocked
            ? "Approved. You appear in listings and can accept bookings."
            : "Schedule, bookings, chats and portfolios unlock once an admin approves your qualification."}
        </Text>
      </View>

      <VerificationStep
        actionLabel={describeStepAction(identity, "identity")}
        description={
          identity === "approved"
            ? "Your identity has been approved."
            : identity === "rejected"
              ? note || "Update your details and submit again."
              : "Submit your real name and contact details for review."
        }
        onPress={onOpenForm}
        status={identity}
        title="1 · Identity"
      />

      <VerificationStep
        actionLabel={describeStepAction(qualification, "qualification")}
        description={
          qualification === "locked"
            ? "Available once your identity is approved."
            : qualification === "approved"
              ? "Your qualification has been approved."
              : qualification === "rejected"
                ? note || "Update your certificates and submit again."
                : "Your certificates and business details are with an admin."
        }
        onPress={onOpenForm}
        status={qualification}
        title="2 · Qualification"
      />
    </View>
  );
}

function VerificationStep({
  actionLabel,
  description,
  onPress,
  status,
  title,
}: {
  actionLabel: string | null;
  description: string;
  onPress: () => void;
  status: StepState;
  title: string;
}) {
  return (
    <View style={styles.verificationStep}>
      <View style={styles.verificationStepHeader}>
        <Text style={styles.verificationStepTitle}>{title}</Text>
        <View
          style={[
            styles.verificationPill,
            status === "approved" ? styles.verificationPillApproved : null,
            status === "rejected" ? styles.verificationPillRejected : null,
            status === "locked" ? styles.verificationPillLocked : null,
          ]}
        >
          <Text style={styles.verificationPillText}>{describeStatus(status)}</Text>
        </View>
      </View>
      <Text style={styles.statusText}>{description}</Text>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.verificationAction,
            pressed ? styles.verificationActionPressed : null,
          ]}
        >
          <Text style={styles.verificationActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReviewRow({ review }: { review: Review }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewTopRow}>
        <Text style={styles.ratingText}>{review.rating.toFixed(1)} stars</Text>
        <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>
      </View>
      <Text style={styles.reviewComment}>
        {review.comment || "No written review"}
      </Text>
    </View>
  );
}

function getDefaultCertificateFileName(mimeType?: string | null) {
  if (mimeType === "video/mp4") {
    return "certificate.mp4";
  }

  if (mimeType === "application/pdf") {
    return "certificate.pdf";
  }

  if (mimeType === "image/jpeg") {
    return "certificate.jpg";
  }

  return "certificate";
}

function isAllowedCertificateFile(fileName: string, mimeType?: string | null) {
  const extension = fileName.includes(".")
    ? `.${fileName.split(".").pop()?.toLowerCase()}`
    : "";

  if (extension === ".jpg" || extension === ".jpeg") {
    return (
      !mimeType ||
      mimeType === "image/jpeg" ||
      mimeType === "application/octet-stream"
    );
  }

  if (extension === ".mp4") {
    return (
      !mimeType ||
      mimeType === "video/mp4" ||
      mimeType === "application/octet-stream"
    );
  }

  if (extension === ".pdf") {
    return (
      !mimeType ||
      mimeType === "application/pdf" ||
      mimeType === "application/octet-stream"
    );
  }

  return false;
}

function getCertificateMimeType(fileName: string, mimeType?: string | null) {
  if (
    mimeType === "image/jpeg" ||
    mimeType === "video/mp4" ||
    mimeType === "application/pdf"
  ) {
    return mimeType;
  }

  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "mp4") {
    return "video/mp4";
  }

  if (extension === "pdf") {
    return "application/pdf";
  }

  return "image/jpeg";
}

function getCertificateMediaType(mimeType: string) {
  if (mimeType === "video/mp4") {
    return "video";
  }

  if (mimeType === "application/pdf") {
    return "document";
  }

  return "image";
}

function getCertificateDisplayName(value: string) {
  return value.split("/").pop() || value;
}

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  formContent: {
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  formHeader: {
    gap: spacing.sm,
  },
  formTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  formSubtitle: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  formCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  fileHint: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  fileActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  selectedFilesList: {
    gap: spacing.xs,
  },
  selectedFileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  selectedFileText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },
  removeFileText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  provinceButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  provinceText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tagChip: {
    minHeight: 38,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  tagChipActive: {
    borderColor: colors.primary,
    backgroundColor: "#EAF8F3",
  },
  tagText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  tagTextActive: {
    color: colors.primary,
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  twoColumnItem: {
    flex: 1,
  },
  locationHint: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  locationHintText: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  formMessage: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  headerContent: {
    gap: spacing.lg,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  avatarBox: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  profileTextBox: {
    flex: 1,
    gap: spacing.xs,
  },
  editButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BFE8D7",
    borderRadius: 20,
    backgroundColor: "#F2FBF7",
  },
  nameText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  businessText: {
    color: colors.mutedText,
    fontSize: 14,
  },
  verificationCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  verificationHeader: {
    gap: spacing.xs,
  },
  verificationHint: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  verificationStep: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  verificationStepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  verificationStepTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  verificationPill: {
    borderRadius: radius.sm,
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  verificationPillApproved: {
    backgroundColor: "#E7F6F0",
  },
  verificationPillRejected: {
    backgroundColor: "#FDEEEE",
  },
  verificationPillLocked: {
    backgroundColor: colors.surface,
  },
  verificationPillText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  verificationAction: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  verificationActionPressed: {
    opacity: 0.7,
  },
  verificationActionText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  statusCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: "#F4D48A",
    borderRadius: radius.md,
    backgroundColor: "#FFF9E8",
    padding: spacing.md,
  },
  rejectedCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: "#F2C6C6",
    borderRadius: radius.md,
    backgroundColor: "#FFF7F7",
    padding: spacing.md,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  statusText: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  moreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  moreText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  portfolioGap: {
    width: spacing.md,
  },
  reviewCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  reviewTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  ratingText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  reviewDate: {
    color: colors.mutedText,
    fontSize: 13,
  },
  reviewComment: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  footerLoader: {
    paddingVertical: spacing.lg,
  },
});
