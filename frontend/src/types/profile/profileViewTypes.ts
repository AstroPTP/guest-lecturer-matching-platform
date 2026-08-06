export interface ProfileViewField {
  label: string;
  value?: string;
  href?: string;
}

export interface ProfileViewTagGroup {
  label: string;
  items: string[];
}

export interface ProfileViewSection {
  title: string;
  editHref?: string;
  fields?: ProfileViewField[];
  tagGroups?: ProfileViewTagGroup[];
}

export interface ProfileViewData {
  roleLabel: string;

  fullName: string;
  role?: string;
  organisation?: string;
  bio?: string;
  photoPreview?: string;

  mainSections: ProfileViewSection[];
  sideSections: ProfileViewSection[];
}
