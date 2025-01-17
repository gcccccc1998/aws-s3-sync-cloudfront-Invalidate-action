import { S3, Credentials, config, CloudFront } from "aws-sdk";
import { CredentialsOptions } from "aws-sdk/lib/credentials";
import { lookup } from "mime-types";
import { encodeUrl, getEtag, toPosixPath } from "./utils";
import { join } from "path";

export class AWSHelper {
  public static GetCredentials(): Promise<Credentials | CredentialsOptions> {
    return new Promise((resolve, reject) => {
      config.getCredentials((err, credentials) => {
        if (err) {
          reject(err);
        } else {
          resolve(credentials);
        }
      });
    });
  }

  public static CompareETag(
    s3: S3,
    bucket: string,
    key: string,
    file: Buffer
  ): Promise<{ hasFile: boolean; needUpload: boolean }> {
    return new Promise((resolve, reject) => {
      s3.headObject({ Bucket: bucket, Key: key }, (err, data) => {
        if (err) {
          resolve({ hasFile: false, needUpload: true });
        } else {
          const etag = getEtag(file);
          const needUpload = data.ETag !== JSON.stringify(etag);
          resolve({ hasFile: true, needUpload });
        }
      });
    });
  }

  public static NeedUpdate(
    s3: S3,
    bucket: string,
    key: string,
    file: Buffer
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      s3.headObject({ Bucket: bucket, Key: key }, (err, data) => {
        if (err) {
          resolve(false);
        } else {
          const etag = getEtag(file);
          resolve(data.ETag !== JSON.stringify(etag));
        }
      });
    });
  }

  public static UploadFile(
    s3: S3,
    bucket: string,
    key: string,
    file: Buffer,
    options?: {
      acl?: string;
      sse?: string;
    }
  ): Promise<S3.ManagedUpload.SendData> {
    const { acl, sse } = options ?? {};
    return new Promise((resolve, reject) => {
      const contentType = lookup(key);
      if (!contentType) {
        return reject(new Error(`${key} is not a valid mime-type`));
      }
      s3.upload(
        {
          Body: file,
          Bucket: bucket,
          ACL: acl || "public-read",
          Key: key,
          ContentType: contentType,
          ServerSideEncryption: sse,
        },
        {},
        (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        }
      );
    });
  }

  public static CreateInvalidation(
    distributionId: string,
    fileKeys: string[]
  ): Promise<CloudFront.CreateInvalidationResult> {
    return new Promise((resolve, reject) => {
      const cf = new CloudFront({});
      cf.createInvalidation(
        {
          DistributionId: distributionId,
          InvalidationBatch: {
            Paths: {
              Items: fileKeys,
              Quantity: fileKeys.length,
            },
            CallerReference: Date.now().toString(),
          },
        },
        (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        }
      );
    });
  }
}
