import { memo, useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { ChevronUp } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { DensityIcon } from "@/components/ui/density-icon";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { ProjectLeadingVisual } from "@/components/sidebar/project-leading-visual";
import {
  useSidebarProjectStatusBucket,
  type SidebarProjectEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { density, densityFontSize } from "@/styles/density";

interface CollapsedProjectsProps {
  projects: readonly SidebarProjectEntry[];
  projectIconByProjectViewKey: ReadonlyMap<string, string | null>;
  onRestore: (projectViewKey: string) => void;
}

const collapsedAccessibilityState = { expanded: false };

export function CollapsedProjects({
  projects,
  projectIconByProjectViewKey,
  onRestore,
}: CollapsedProjectsProps) {
  const { t } = useTranslation();
  if (projects.length === 0) return null;
  return (
    <View style={styles.section} testID="sidebar-collapsed-projects">
      <Text style={styles.heading} accessibilityRole="header">
        {t("sidebar.collapsedProjects.title")} ({projects.length})
      </Text>
      <ScrollView style={styles.list} showsVerticalScrollIndicator>
        {projects.map((project) => (
          <CollapsedProjectRow
            key={project.viewKey}
            project={project}
            iconDataUri={projectIconByProjectViewKey.get(project.viewKey) ?? null}
            onRestore={onRestore}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const CollapsedProjectRow = memo(function CollapsedProjectRow({
  project,
  iconDataUri,
  onRestore,
}: {
  project: SidebarProjectEntry;
  iconDataUri: string | null;
  onRestore: (projectViewKey: string) => void;
}) {
  const { t } = useTranslation();
  const active = useRetainedPanelActive();
  const statusBucket = useSidebarProjectStatusBucket({
    workspaces: project.workspaces,
    enabled: active,
  });
  const restore = useCallback(() => onRestore(project.viewKey), [onRestore, project.viewKey]);
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityLabel={t("sidebar.collapsedProjects.expand", { name: project.projectName })}
      accessibilityState={collapsedAccessibilityState}
      style={styles.row}
      highlightStyle={styles.rowHighlight}
      onPress={restore}
      testID={`sidebar-collapsed-project-${project.viewKey}`}
    >
      <ProjectLeadingVisual
        displayName={project.projectName}
        projectViewKey={project.viewKey}
        iconDataUri={iconDataUri}
        statusBucket={statusBucket}
        backdrop="surfaceSidebar"
      />
      <Text style={styles.title} numberOfLines={1}>
        {project.projectName}
      </Text>
      <DensityIcon icon={ChevronUp} size="xs" color="foregroundMuted" />
    </PressHighlight>
  );
});

const styles = StyleSheet.create((theme) => ({
  section: {
    maxHeight: "35%",
    flexShrink: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  heading: {
    color: theme.colors.foregroundMuted,
    fontSize: densityFontSize(theme, "sm"),
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  list: { flexGrow: 0, flexShrink: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: density.tightRowHeight,
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  rowHighlight: { backgroundColor: theme.colors.interactionHighlight },
  title: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: densityFontSize(theme, "base"),
  },
}));
