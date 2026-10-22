import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/**
 * 学生认证：C 端提交学校/学号/学生证照片 → pending，后台审核 → approved/rejected。
 * 仅 approved 客户享学生价券模板。状态值：none / pending / approved / rejected。
 */
const STUDENT_FIELDS = `
    customerId
    customerName
    customerEmail
    status
    school
    studentNo
    idImg
    reviewedAt
`;

export const MY_STUDENT_VERIFICATION = gql`
    query MyStudentVerification {
        myStudentVerification {
            ${STUDENT_FIELDS}
        }
    }
`;

export const APPLY_STUDENT_VERIFICATION = gql`
    mutation ApplyStudentVerification($school: String!, $studentNo: String!, $idImg: String) {
        applyStudentVerification(school: $school, studentNo: $studentNo, idImg: $idImg) {
            ${STUDENT_FIELDS}
        }
    }
`;

export async function fetchMyStudentVerification(): Promise<any> {
    const res: any = await getGraphQLClient().request(MY_STUDENT_VERIFICATION);
    return res?.myStudentVerification ?? null;
}

export async function applyStudentVerification(school: string, studentNo: string, idImg?: string): Promise<any> {
    const res: any = await getGraphQLClient().request(APPLY_STUDENT_VERIFICATION, {
        school: school.trim(),
        studentNo: studentNo.trim(),
        idImg: idImg || null,
    });
    return res?.applyStudentVerification ?? null;
}
