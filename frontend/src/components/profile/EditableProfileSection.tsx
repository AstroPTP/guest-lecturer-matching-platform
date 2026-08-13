"use client";

import { ReactNode } from "react";
import Image from "next/image";

import editIcon from "@/assets/edit.png";

interface EditableProfileSectionProps {
  title: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
  editContent: ReactNode;
}

export default function EditableProfileSection({ title, isEditing, onEdit, onCancel, onSave, children, editContent }: EditableProfileSectionProps) {
  return (
    <section className="rounded-2xl bg-white p-7 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <h2 className="text-xl font-bold text-[#2d2d2d]">{title}</h2>

        {!isEditing && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={"Edit " + title}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg text-gray-600 transition-colors hover:bg-gray-200 hover:text-black"
          >
            <Image src={editIcon} alt="" width={18} height={18} aria-hidden="true" className="h-[18px] w-[18px] object-contain" />
          </button>
        )}
      </div>

      {isEditing ? editContent : children}

      {isEditing && (
        <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-5">
          <button type="button" onClick={onCancel} className="rounded-xl bg-gray-200 px-6 py-3 font-semibold text-[#2d2d2d] hover:bg-gray-300">
            Cancel
          </button>

          <button type="button" onClick={onSave} className="rounded-xl bg-[#2d2d2d] px-6 py-3 font-semibold text-white hover:bg-black">
            Save
          </button>
        </div>
      )}
    </section>
  );
}
