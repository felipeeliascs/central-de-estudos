-- Storage RLS resolves each requested object name to its material.
create index study_materials_file_path_idx
  on public.study_materials (file_path);

